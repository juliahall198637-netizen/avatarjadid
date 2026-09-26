"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, type ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { toast } from "sonner";

// Small, dependency-free primitives for the admin panel.

export async function api<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json: body, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    headers: body !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: body !== undefined ? JSON.stringify(body) : rest.body,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("unauthorized");
  }
  if (!response.ok) throw new Error((data as { message?: string }).message ?? `خطای ${response.status}`);
  return data as T;
}

/** Runs an action, showing its error (or success message) as a toast. */
export async function attempt<T>(action: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const result = await action();
    if (success) toast.success(success);
    return result;
  } catch (error) {
    if ((error as Error).message !== "unauthorized") toast.error((error as Error).message);
    return undefined;
  }
}

const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  busy,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline"; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-ink hover:brightness-110",
        variant === "outline" && "border border-line text-white/85 hover:bg-white/5",
        variant === "ghost" && "text-white/70 hover:bg-white/5 hover:text-white",
        variant === "danger" && "border border-danger/40 text-danger hover:bg-danger/10",
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

const fieldClass =
  "w-full rounded-lg border border-line bg-ink/60 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-accent/60 disabled:opacity-50";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldClass, props.className)} />;
}

/** Password or secret field with a show/hide toggle, so admins can check what they typed. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        dir="ltr"
        {...props}
        type={visible ? "text" : "password"}
        spellCheck={false}
        className={cx(fieldClass, "pl-10", props.className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "پنهان کردن" : "نمایش"}
        title={visible ? "پنهان کردن" : "نمایش"}
        className="absolute inset-y-0 left-0 flex w-10 items-center justify-center text-muted transition hover:text-white"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** A random password that is easy to read aloud and retype (no look-alike characters). */
export function generatePassword(length = 14) {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldClass, "leading-7", props.className)} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(fieldClass, "cursor-pointer", props.className)}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-white/15")}
      >
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-0.5" : "left-[22px]")} />
      </button>
    </label>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-white/85">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-6 text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ title, description, actions, children }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-bold">{title}</h2>}
            {description && <p className="mt-1 text-sm leading-7 text-muted">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "bad" | "warn"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs",
        tone === "neutral" && "bg-white/10 text-white/70",
        tone === "ok" && "bg-accent/15 text-accent",
        tone === "bad" && "bg-danger/15 text-danger",
        tone === "warn" && "bg-warm/15 text-warm",
      )}
    >
      {children}
    </span>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export { cx };
