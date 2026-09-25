import { ApiError } from "./api";
import { sign, unsign } from "./crypto";

// The browser holds this instead of D-ID credentials: it names one stream,
// belongs to one visitor and expires with the longest allowed conversation.

export interface DidStreamRef {
  streamId: string;
  sessionId: string;
  visitor: string;
}

const TTL_MS = 2 * 60 * 60 * 1000;

export function signDidToken(ref: DidStreamRef): string {
  return sign(Buffer.from(JSON.stringify({ ...ref, exp: Date.now() + TTL_MS })).toString("base64url"));
}

export function readDidToken(token: string, visitor: string): DidStreamRef {
  const payload = unsign(token);
  if (!payload) throw new ApiError(403, "bad_token", "نشست آواتار نامعتبر است.");
  const ref = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DidStreamRef & { exp: number };
  if (ref.exp < Date.now() || ref.visitor !== visitor) throw new ApiError(403, "bad_token", "نشست آواتار منقضی شده است.");
  return ref;
}
