import { ApiError, assertSameOrigin, clientIp, json, route } from "@/lib/server/api";
import { describeError } from "@/lib/server/http";
import { signDidToken } from "@/lib/server/did-token";
import { db } from "@/lib/server/db";
import { createDidSession, createLiveAvatarSession, createSimliSession, didImageFromAsset } from "@/lib/server/providers/avatar";
import { providerFor } from "@/lib/server/providers/registry";
import { hit } from "@/lib/server/ratelimit";
import { getSettings } from "@/lib/server/settings";
import { existingVisitorId } from "@/lib/server/visitor";

export const dynamic = "force-dynamic";

/** Mints a short-lived session for the streaming avatar. Each one costs credits, hence the tight limits. */
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  const visitor = await existingVisitorId();
  const settings = await getSettings();
  const { avatar, limits } = settings;
  if (avatar.type === "builtin") throw new ApiError(400, "builtin", "آواتار داخلی نیازی به نشست ندارد.");

  await hit(`avatar:v:${visitor}`, limits.avatarSessionsPerHour, 3600);
  await hit(`avatar:ip:${clientIp(request)}`, limits.avatarSessionsPerHour * 5, 3600);
  await hit(`avatar:global`, limits.avatarSessionsPerDayGlobal, 86400);

  try {
    if (avatar.type === "simli") {
      if (!avatar.simli.providerId) throw new ApiError(503, "not_configured", "سرویس Simli انتخاب نشده.");
      return json(await createSimliSession(await providerFor(avatar.simli.providerId, "avatar"), avatar.simli.faceId));
    }
    if (avatar.type === "did") {
      if (!avatar.did.providerId) throw new ApiError(503, "not_configured", "سرویس D-ID انتخاب نشده.");
      const provider = await providerFor(avatar.did.providerId, "avatar");
      let sourceUrl = avatar.did.sourceUrl.trim();
      let posterUrl: string | null = /^https:\/\//.test(sourceUrl) ? sourceUrl : null;
      if (!sourceUrl) {
        const portraitId = avatar.builtin.portraitAssetId;
        if (!portraitId) throw new ApiError(503, "not_configured", "برای D-ID تصویر چهره تعیین نشده است.");
        const [image] = await db()`select mime, data from assets where id = ${portraitId}`;
        if (!image) throw new ApiError(503, "not_configured", "تصویر چهرهٔ آواتار پیدا نشد.");
        sourceUrl = await didImageFromAsset(provider, portraitId, { mime: image.mime as string, data: new Uint8Array(image.data as Buffer) });
        posterUrl = `/api/assets/${portraitId}`;
      }
      const session = await createDidSession(provider, sourceUrl);
      return json({
        type: "did",
        offer: session.offer,
        iceServers: session.iceServers,
        posterUrl,
        token: signDidToken({ streamId: session.streamId, sessionId: session.sessionId, visitor }),
      });
    }
    if (!avatar.liveavatar.providerId) throw new ApiError(503, "not_configured", "سرویس LiveAvatar انتخاب نشده.");
    const provider = await providerFor(avatar.liveavatar.providerId, "avatar");
    return json(await createLiveAvatarSession(provider, avatar.liveavatar.avatarId, avatar.liveavatar.sandbox));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.warn("[avatar-session]", describeError(error));
    throw new ApiError(502, "avatar_failed", "اتصال به سرویس آواتار برقرار نشد.");
  }
});
