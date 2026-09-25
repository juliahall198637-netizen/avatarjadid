"use client";

import { BookOpen, Keyboard, Maximize2, Mic, MicOff, Minimize2, Settings, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useConversation, type ConversationOptions, type Status } from "@/lib/client/useConversation";

import { BuiltinAvatar } from "./avatar/BuiltinAvatar";
import { StreamingAvatar } from "./avatar/StreamingAvatar";
import type { PublicAvatarConfig } from "./avatar/types";

const STATUS_TEXT: Record<Status, string> = {
  idle: "",
  connecting: "در حال آماده‌سازی…",
  listening: "در حال شنیدن",
  hearing: "می‌شنوم…",
  thinking: "در حال فکر کردن…",
  speaking: "در حال پاسخ",
  error: "",
};

export function AvatarApp({
  avatar,
  title,
  subtitle,
  name,
  options,
  kiosk = false,
}: {
  avatar: PublicAvatarConfig;
  title: string;
  subtitle: string;
  name: string;
  options: ConversationOptions;
  /** Public-terminal mode: no admin link, a fullscreen toggle. */
  kiosk?: boolean;
}) {
  const conversation = useConversation(options);
  const { status, userText, assistantText, sources, notice, start, stop, sendText, setDriver } = conversation;
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Some browsers refuse fullscreen; the kiosk still works without it.
    }
  }
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const active = status !== "idle" && status !== "error";

  return (
    <main className="stage-bg relative flex h-dvh flex-col items-center overflow-hidden px-4 pb-6 pt-5">
      {kiosk ? (
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
          className="absolute left-4 top-4 rounded-full p-2 text-white/25 transition hover:bg-white/5 hover:text-white/60"
        >
          {fullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
        </button>
      ) : (
        <Link
          href="/admin"
          aria-label="پنل مدیریت"
          className="absolute left-4 top-4 rounded-full p-2 text-white/20 transition hover:bg-white/5 hover:text-white/60"
        >
          <Settings className="size-5" />
        </Link>
      )}

      <header className="mb-3 text-center">
        <h1 className="text-lg font-bold tracking-tight text-white/90 sm:text-xl">{title}</h1>
      </header>

      <section className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="avatar-frame h-full max-h-[62vh] sm:max-h-[66vh]" data-status={status}>
          {avatar.type === "builtin" ? (
            <BuiltinAvatar config={avatar} onDriver={setDriver} />
          ) : (
            <StreamingAvatar type={avatar.type} onDriver={setDriver} />
          )}
          {active && (
            <div className="absolute inset-x-0 -bottom-3 flex justify-center">
              <span className="flex items-center gap-2 rounded-full border border-line bg-panel/90 px-3 py-1 text-xs text-white/80 backdrop-blur">
                {(status === "listening" || status === "hearing") && (
                  <span className="listening-dots flex gap-0.5" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="block size-1 rounded-full bg-accent opacity-60" />
                    ))}
                  </span>
                )}
                {STATUS_TEXT[status]}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 flex w-full max-w-xl flex-col items-center gap-3" aria-live="polite">
        {active && (userText || assistantText) ? (
          <div className="w-full space-y-1.5 text-center">
            {userText && <p className="line-clamp-2 text-sm text-muted">«{userText}»</p>}
            {assistantText && <p className="line-clamp-3 text-base leading-8 text-white/90">{assistantText}</p>}
            {sources.length > 0 && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-accent/80">
                <BookOpen className="size-3.5" /> منبع: {sources.join("، ")}
              </p>
            )}
          </div>
        ) : (
          !active && <p className="text-center text-sm leading-7 text-muted">{subtitle}</p>
        )}

        {notice && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-center text-sm text-danger">
            {notice}
          </p>
        )}

        <div className="flex items-center gap-3">
          {active && (
            <button
              type="button"
              onClick={() => setTyping((v) => !v)}
              aria-label="نوشتن پرسش"
              className="rounded-full border border-line p-3 text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              <Keyboard className="size-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => (active ? void stop() : void start())}
            disabled={status === "connecting"}
            className={`flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold shadow-lg transition disabled:opacity-60 ${
              active ? "bg-white/10 text-white hover:bg-white/15" : "bg-accent text-ink hover:brightness-110"
            }`}
          >
            {active ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            {active ? "پایان گفتگو" : status === "error" ? "تلاش دوباره" : `گفتگو با ${name}`}
          </button>
        </div>

        {active && typing && (
          <form
            className="flex w-full gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendText(draft);
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="پرسش خود را بنویسید…"
              maxLength={1000}
              className="min-w-0 flex-1 rounded-full border border-line bg-panel px-4 py-2.5 text-sm outline-none focus:border-accent/60"
            />
            <button type="submit" aria-label="ارسال" className="rounded-full bg-accent p-2.5 text-ink">
              <Send className="size-4 -scale-x-100" />
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
