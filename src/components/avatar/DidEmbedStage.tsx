"use client";

import { Maximize2, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { DidEmbedConfig } from "./types";

type Status = "loading" | "ready" | "error" | "empty";

const TARGET_ID = "did-agent-target";

/**
 * D-ID's own Agent, embedded full-screen. In this mode D-ID listens, answers
 * and speaks by itself: language, voice, knowledge and persona are set in
 * D-ID Studio, not in our admin panel.
 */
export function DidEmbedStage({ config, title, kiosk }: { config: DidEmbedConfig; title: string; kiosk: boolean }) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (!config.clientKey || !config.agentId) {
      setStatus("empty");
      return;
    }
    setStatus("loading");
    const target = targetRef.current;
    if (target) target.innerHTML = "";
    document.querySelectorAll("script[data-aj-did-agent]").forEach((el) => el.remove());

    const script = document.createElement("script");
    script.type = "module";
    script.src = config.scriptUrl;
    script.setAttribute("data-aj-did-agent", "true");
    script.setAttribute("data-mode", config.mode);
    script.setAttribute("data-client-key", config.clientKey);
    script.setAttribute("data-agent-id", config.agentId);
    script.setAttribute("data-name", "did-agent");
    script.setAttribute("data-monitor", String(config.monitor));
    script.setAttribute("data-orientation", config.orientation);
    script.setAttribute("data-position", config.position);
    if (config.mode === "full") script.setAttribute("data-target-id", TARGET_ID);
    script.onload = () => setStatus("ready");
    script.onerror = () => setStatus("error");
    document.body.appendChild(script);

    // Nothing rendered: usually a wrong key or this domain missing from D-ID's allowed domains.
    const timer = window.setTimeout(() => {
      const rendered = (target?.childElementCount ?? 0) > 0 || document.querySelector("[data-testid='didagent_root']");
      if (!rendered) setStatus((s) => (s === "error" ? s : "empty"));
    }, 10_000);

    return () => {
      window.clearTimeout(timer);
      script.remove();
      if (target) target.innerHTML = "";
    };
  }, [config]);

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* not allowed in this browser */
    }
  }

  return (
    <main className="stage-bg relative flex h-dvh flex-col overflow-hidden">
      {kiosk ? (
        <button type="button" onClick={fullscreen} aria-label="تمام‌صفحه" className="absolute left-4 top-4 z-10 rounded-full p-2 text-white/25 hover:bg-white/5 hover:text-white/60">
          <Maximize2 className="size-5" />
        </button>
      ) : (
        <Link href="/admin" aria-label="پنل مدیریت" className="absolute left-4 top-4 z-10 rounded-full p-2 text-white/20 hover:bg-white/5 hover:text-white/60">
          <Settings className="size-5" />
        </Link>
      )}
      <h1 className="sr-only">{title}</h1>
      <div id={TARGET_ID} ref={targetRef} className="h-full w-full" />

      {status === "loading" && <p className="pointer-events-none absolute inset-x-0 bottom-10 text-center text-sm text-muted">در حال بارگذاری آواتار…</p>}
      {(status === "error" || status === "empty") && (
        <div className="absolute inset-x-0 bottom-10 mx-auto max-w-md px-6 text-center">
          <p className="text-sm font-medium text-danger">
            {status === "error" ? "اسکریپت آواتار D-ID بارگذاری نشد." : "آواتار D-ID نمایش داده نشد."}
          </p>
          <p className="mt-2 text-xs leading-6 text-muted">
            {status === "error"
              ? "دسترسی مرورگر به agent.d-id.com را بررسی کنید (از داخل ایران ممکن است فیلترشکن لازم باشد)."
              : "Client Key و Agent ID را در پنل بررسی کنید و در D-ID Studio، بخش Embed → Allowed Domains، دقیقاً این نشانی را اضافه کنید:"}
          </p>
          {status === "empty" && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <code dir="ltr" className="rounded-md border border-line bg-panel px-2 py-1 text-xs">
                {origin || "—"}
              </code>
              <button
                type="button"
                className="rounded-md border border-line px-2 py-1 text-xs hover:bg-white/5"
                onClick={() => void navigator.clipboard.writeText(origin).then(() => setCopied(true))}
              >
                {copied ? "کپی شد" : "کپی"}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
