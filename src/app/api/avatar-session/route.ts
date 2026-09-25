import { ApiError, assertSameOrigin, clientIp, json, route } from "@/lib/server/api";
import { describeError } from "@/lib/server/http";
import { createLiveAvatarSession, createSimliSession } from "@/lib/server/providers/avatar";
import { providerFor } from "@/lib/server/providers/registry";
import { hit } from "@/lib/server/ratelimit";
import { getSettings } from "@/lib/server/settings";
import { visitorId } from "@/lib/server/visitor";

export const dynamic = "force-dynamic";

/** Mints a short-lived session for the streaming avatar. Each one costs credits, hence the tight limits. */
export const POST = route(async (request: Request) => {
  assertSameOrigin(request);
  const settings = await getSettings();
  const { avatar, limits } = settings;
  if (avatar.type === "builtin") throw new ApiError(400, "builtin", "آواتار داخلی نیازی به نشست ندارد.");

  const visitor = await visitorId();
  await hit(`avatar:v:${visitor}`, limits.avatarSessionsPerHour, 3600);
  await hit(`avatar:ip:${clientIp(request)}`, limits.avatarSessionsPerHour * 5, 3600);
  await hit(`avatar:global`, limits.avatarSessionsPerDayGlobal, 86400);

  try {
    if (avatar.type === "simli") {
      if (!avatar.simli.providerId) throw new ApiError(503, "not_configured", "سرویس Simli انتخاب نشده.");
      return json(await createSimliSession(await providerFor(avatar.simli.providerId, "avatar"), avatar.simli.faceId));
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
