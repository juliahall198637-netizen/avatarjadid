import { ApiError } from "./api";
import { db } from "./db";

/**
 * Fixed-window counter in PostgreSQL, so limits hold across restarts and
 * multiple instances. Throws 429 when `limit` is exceeded.
 */
export async function hit(bucket: string, limit: number, windowSec: number): Promise<void> {
  const rows = await db()`
    insert into rate_limits (bucket, window_start, count)
    values (${bucket}, to_timestamp(floor(extract(epoch from now()) / ${windowSec}) * ${windowSec}), 1)
    on conflict (bucket, window_start) do update set count = rate_limits.count + 1
    returning count`;
  if ((rows[0]?.count as number) > limit) {
    throw new ApiError(429, "rate_limited", "تعداد درخواست‌ها زیاد است. لطفاً کمی بعد دوباره تلاش کنید.");
  }
  if (Math.random() < 0.01) {
    void db()`delete from rate_limits where window_start < now() - interval '2 days'`.catch(() => {});
  }
}
