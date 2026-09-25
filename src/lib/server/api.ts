import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** An error whose message is safe to show to the caller (Persian). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init.headers ?? {}) },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return json(
      { error: "invalid_input", message: `ورودی نامعتبر: ${first?.path.join(".") || ""} ${first?.message ?? ""}`.trim() },
      { status: 400 },
    );
  }
  console.error("[api] unexpected error", error);
  return json({ error: "internal", message: "خطای داخلی سرور. لطفاً دوباره تلاش کنید." }, { status: 500 });
}

/** Wraps a route handler so thrown ApiErrors become JSON responses. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Rejects cross-site state-changing requests. Cookies are SameSite=Strict as
 * well; this is the second, independent check.
 */
export function assertSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin) return; // Same-origin fetches from older browsers omit it; SameSite covers them.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "bad_origin", "درخواست از مبدأ نامعتبر است.");
  }
  if (!host || originHost !== host) throw new ApiError(403, "bad_origin", "درخواست از مبدأ نامعتبر است.");
}
