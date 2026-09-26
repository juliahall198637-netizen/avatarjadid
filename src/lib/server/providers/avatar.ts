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

// ── D-ID Talks Streams ──────────────────────────────────────────────────────
// D-ID renders the face over WebRTC; each sentence of our own Persian speech
// is uploaded as audio and played through a "talk" with an audio script.

/** "talks" animates a photo; "clips" uses a premium D-ID presenter. */
export type DidKind = "talks" | "clips";

export interface DidSession {
  type: "did";
  kind: DidKind;
  streamId: string;
  sessionId: string;
  offer: RTCSessionDescriptionInit;
  iceServers: RTCIceServer[];
}

function didHeaders(provider: Provider, json = true): Record<string, string> {
  const key = requireKey(provider);
  const auth = /^(Basic|Bearer) /.test(key) ? key : `Basic ${key}`;
  return json ? { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" } : { Authorization: auth, Accept: "application/json" };
}

function didBase(provider: Provider) {
  return baseUrl(provider, "https://api.d-id.com");
}

async function didCall<T>(provider: Provider, path: string, method: string, body?: unknown): Promise<T> {
  const response = await ensureOk(
    await outboundFetch(
      `${didBase(provider)}${path}`,
      { method, headers: didHeaders(provider), body: body === undefined ? undefined : JSON.stringify(body) },
      { useProxy: provider.useProxy, timeoutMs: 30_000 },
    ),
    provider.name,
  );
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function didUpload(provider: Provider, path: "/audios" | "/images", field: "audio" | "image", data: Uint8Array, filename: string, type: string) {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(data)], { type }), filename);
  const response = await ensureOk(
    await outboundFetch(`${didBase(provider)}${path}`, { method: "POST", headers: didHeaders(provider, false), body: form }, { useProxy: provider.useProxy, timeoutMs: 30_000 }),
    provider.name,
  );
  const json = (await response.json()) as { url?: string };
  if (!json.url) throw new UpstreamError(`${provider.name}: نشانی فایل بارگذاری‌شده دریافت نشد.`, null);
  return json.url;
}

// D-ID keeps uploaded images; one upload per portrait is enough for this process.
const uploadedImages = new Map<string, string>();

/** Uploads a stored portrait to D-ID once and returns its D-ID url. */
export async function didImageFromAsset(provider: Provider, assetId: string, image: { mime: string; data: Uint8Array }) {
  const key = `${provider.id}:${assetId}`;
  const cached = uploadedImages.get(key);
  if (cached) return cached;
  const ext = image.mime === "image/png" ? "png" : image.mime === "image/webp" ? "webp" : "jpg";
  const url = await didUpload(provider, "/images", "image", image.data, `portrait.${ext}`, image.mime);
  uploadedImages.set(key, url);
  return url;
}

export async function createDidSession(provider: Provider, source: { presenterId: string } | { sourceUrl: string }): Promise<DidSession> {
  const kind: DidKind = "presenterId" in source ? "clips" : "talks";
  const body = "presenterId" in source ? { presenter_id: source.presenterId, stream_warmup: true } : { source_url: source.sourceUrl, stream_warmup: true };
  const created = await didCall<{
    id?: string;
    session_id?: string;
    offer?: RTCSessionDescriptionInit;
    jsep?: RTCSessionDescriptionInit;
    ice_servers?: RTCIceServer[];
  }>(provider, `/${kind}/streams`, "POST", body);
  const offer = created.offer ?? created.jsep;
  if (!created.id || !created.session_id || !offer) throw new UpstreamError(`${provider.name}: پاسخ ساخت نشست ناقص است.`, null);
  return { type: "did", kind, streamId: created.id, sessionId: created.session_id, offer, iceServers: created.ice_servers ?? [] };
}

const streamPath = (kind: DidKind, streamId: string) => `/${kind}/streams/${encodeURIComponent(streamId)}`;

export function didSdp(provider: Provider, kind: DidKind, streamId: string, sessionId: string, answer: RTCSessionDescriptionInit) {
  return didCall(provider, `${streamPath(kind, streamId)}/sdp`, "POST", { answer, session_id: sessionId });
}

export function didIce(
  provider: Provider,
  kind: DidKind,
  streamId: string,
  sessionId: string,
  candidate: { candidate: string | null; sdpMid?: string | null; sdpMLineIndex?: number | null },
) {
  return didCall(provider, `${streamPath(kind, streamId)}/ice`, "POST", { ...candidate, session_id: sessionId });
}

/** Plays one clip of speech (16-bit mono WAV) on the stream; returns its duration in seconds. */
export async function didTalk(provider: Provider, kind: DidKind, streamId: string, sessionId: string, wav: Uint8Array): Promise<number | null> {
  const audioUrl = await didUpload(provider, "/audios", "audio", wav, "speech.wav", "audio/wav");
  const result = await didCall<{ duration?: number }>(provider, streamPath(kind, streamId), "POST", {
    script: { type: "audio", audio_url: audioUrl },
    ...(kind === "talks" ? { config: { stitch: true } } : {}),
    session_id: sessionId,
  });
  return typeof result.duration === "number" ? result.duration : null;
}

export async function didClose(provider: Provider, kind: DidKind, streamId: string, sessionId: string) {
  await didCall(provider, streamPath(kind, streamId), "DELETE", { session_id: sessionId });
}
