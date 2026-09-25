import { ensureOk, outboundFetch, UpstreamError } from "../http";
import { baseUrl, requireKey, type Provider } from "./registry";

// Both services receive the audio our own Persian pipeline produced and only
// animate the face; their built-in voice agents are never used.

export interface SimliSession {
  type: "simli";
  sessionToken: string;
  iceServers: RTCIceServer[];
}

export interface LiveAvatarSession {
  type: "liveavatar";
  sessionToken: string;
}

export async function createSimliSession(provider: Provider, faceId: string): Promise<SimliSession> {
  if (!faceId) throw new UpstreamError("شناسهٔ چهرهٔ Simli (Face ID) در تنظیمات آواتار وارد نشده.", null);
  const base = baseUrl(provider, "https://api.simli.ai");
  const headers = { "Content-Type": "application/json", "x-simli-api-key": requireKey(provider) };
  const opts = { useProxy: provider.useProxy, timeoutMs: 20_000 };

  const tokenResponse = await ensureOk(
    await outboundFetch(
      `${base}/compose/token`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ faceId, handleSilence: true, maxSessionLength: 1800, maxIdleTime: 300 }),
      },
      opts,
    ),
    provider.name,
  );
  const token = (await tokenResponse.json()) as { session_token?: string };
  if (!token.session_token) throw new UpstreamError(`${provider.name}: توکن نشست دریافت نشد.`, null);

  let iceServers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];
  try {
    const ice = await outboundFetch(`${base}/compose/ice`, { headers }, opts);
    if (ice.ok) {
      const list = (await ice.json()) as RTCIceServer[];
      if (Array.isArray(list) && list.length) iceServers = list;
    }
  } catch {
    // STUN fallback above is what the official client uses too.
  }
  return { type: "simli", sessionToken: token.session_token, iceServers };
}

export async function createLiveAvatarSession(provider: Provider, avatarId: string, sandbox: boolean): Promise<LiveAvatarSession> {
  if (!avatarId && !sandbox) throw new UpstreamError("شناسهٔ آواتار LiveAvatar در تنظیمات وارد نشده.", null);
  const response = await ensureOk(
    await outboundFetch(
      `${baseUrl(provider, "https://api.liveavatar.com")}/v1/sessions/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": requireKey(provider) },
        // LITE mode: LiveAvatar renders the face only; we stream our own audio into it.
        body: JSON.stringify({ mode: "LITE", avatar_id: avatarId || undefined, is_sandbox: sandbox }),
      },
      { useProxy: provider.useProxy, timeoutMs: 20_000 },
    ),
    provider.name,
  );
  const json = (await response.json()) as { data?: { session_token?: string }; session_token?: string };
  const sessionToken = json.data?.session_token ?? json.session_token;
  if (!sessionToken) throw new UpstreamError(`${provider.name}: توکن نشست دریافت نشد.`, null);
  return { type: "liveavatar", sessionToken };
}
