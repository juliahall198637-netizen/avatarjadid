import { AccessToken } from "livekit-server-sdk";

import { randomToken } from "../crypto";
import { ensureOk, outboundFetch, UpstreamError } from "../http";
import { baseUrl, requireKey, type Provider } from "./registry";

// LiveKit is the realtime room Beyond Presence's avatar joins. The browser
// joins the same room, streams our Persian PCM to the avatar over a LiveKit
// byte stream, and plays the avatar's video and audio tracks.

/** Identity the avatar joins with; the browser addresses audio to it. */
export const AVATAR_IDENTITY = "bey-avatar-agent";

export interface LiveKitCredentials {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/** The API key and secret are stored together (encrypted) as "key:secret". */
export function livekitCredentials(provider: Provider): LiveKitCredentials {
  const raw = requireKey(provider);
  const split = raw.indexOf(":");
  const url = (provider.baseUrl ?? "").trim();
  if (split <= 0 || !/^wss?:\/\/[^\s/]+/.test(url)) {
    throw new UpstreamError(`سرویس «${provider.name}»: نشانی wss و «کلید:رمز» LiveKit کامل نیست.`, null);
  }
  return { url: url.replace(/\/+$/, ""), apiKey: raw.slice(0, split), apiSecret: raw.slice(split + 1) };
}

function httpUrl(wsUrl: string) {
  return wsUrl.replace(/^ws/, "http");
}

/** Lists rooms: proves the URL, key and secret (and the proxy path) all work. */
export async function testLiveKit(provider: Provider): Promise<string> {
  const creds = livekitCredentials(provider);
  const token = new AccessToken(creds.apiKey, creds.apiSecret, { ttl: 60 });
  token.addGrant({ roomList: true });
  const response = await ensureOk(
    await outboundFetch(
      `${httpUrl(creds.url)}/twirp/livekit.RoomService/ListRooms`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await token.toJwt()}`, "Content-Type": "application/json" },
        body: "{}",
      },
      { useProxy: provider.useProxy, timeoutMs: 15_000 },
    ),
    provider.name,
  );
  const json = (await response.json()) as { rooms?: unknown[] };
  return `اتصال برقرار است؛ ${json.rooms?.length ?? 0} اتاق فعال.`;
}

export interface BeySession {
  type: "bey";
  url: string;
  token: string;
  avatarIdentity: string;
}

/** Creates a private room, a token for the visitor, and asks Beyond Presence to join it. */
export async function createBeySession(bey: Provider, livekit: Provider, avatarId: string): Promise<BeySession> {
  if (!avatarId) throw new UpstreamError("شناسهٔ آواتار Beyond Presence در تنظیمات وارد نشده.", null);
  const creds = livekitCredentials(livekit);
  const room = `aj-${randomToken(9)}`;
  const visitorIdentity = `visitor-${randomToken(6)}`;

  const visitor = new AccessToken(creds.apiKey, creds.apiSecret, { identity: visitorIdentity, ttl: 60 * 60 });
  visitor.addGrant({ roomJoin: true, room, canSubscribe: true, canPublish: false, canPublishData: true });

  // Same shape as the official LiveKit Beyond Presence plugin: an agent token
  // that publishes on behalf of the visitor.
  const avatar = new AccessToken(creds.apiKey, creds.apiSecret, { identity: AVATAR_IDENTITY, name: AVATAR_IDENTITY, ttl: 60 * 60 });
  avatar.kind = "agent";
  avatar.addGrant({ roomJoin: true, room });
  avatar.attributes = { "lk.publish_on_behalf": visitorIdentity };
  const avatarToken = await avatar.toJwt();

  const headers = { "x-api-key": requireKey(bey), "Content-Type": "application/json" };
  const base = baseUrl(bey, "https://api.bey.dev");
  const opts = { useProxy: bey.useProxy, timeoutMs: 30_000 };
  let response = await outboundFetch(
    `${base}/v1/sessions`,
    { method: "POST", headers, body: JSON.stringify({ transport: "livekit", avatar_id: avatarId, url: creds.url, token: avatarToken }) },
    opts,
  );
  if (response.status === 404 || response.status === 405) {
    // Older API shape, still used by the official LiveKit plugin.
    response = await outboundFetch(
      `${base}/v1/session`,
      { method: "POST", headers, body: JSON.stringify({ avatar_id: avatarId, livekit_url: creds.url, livekit_token: avatarToken }) },
      opts,
    );
  }
  await ensureOk(response, bey.name);

  return { type: "bey", url: creds.url, token: await visitor.toJwt(), avatarIdentity: AVATAR_IDENTITY };
}

export async function testBey(provider: Provider): Promise<string> {
  await ensureOk(
    await outboundFetch(
      `${baseUrl(provider, "https://api.bey.dev")}/v1/auth/verify`,
      { headers: { "x-api-key": requireKey(provider), Accept: "application/json" } },
      { useProxy: provider.useProxy, timeoutMs: 15_000 },
    ),
    provider.name,
  );
  return "کلید Beyond Presence معتبر است.";
}
