"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AvatarDriver } from "@/components/avatar/types";

import { base64ToInt16 } from "./audio";

export type Status = "idle" | "connecting" | "listening" | "hearing" | "thinking" | "speaking" | "error";

export interface ConversationOptions {
  greetOnStart: boolean;
  allowBargeIn: boolean;
  speechThreshold: number;
  silenceMs: number;
  maxUtteranceSec: number;
  /** End the conversation after this many seconds without speech (0 = never). */
  idleEndSec: number;
  maxSessionMin: number;
}

type MicVADInstance = { start(): Promise<void>; pause(): Promise<void>; destroy(): Promise<void> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function micErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "اجازهٔ استفاده از میکروفون داده نشد. از نوار آدرس مرورگر دسترسی میکروفون را فعال کنید.";
  }
  if (name === "NotFoundError") return "میکروفونی پیدا نشد.";
  if (name === "NotReadableError") return "میکروفون در اختیار برنامهٔ دیگری است.";
  if (!window.isSecureContext) return "میکروفون فقط روی نشانی https کار می‌کند.";
  return error instanceof Error ? error.message : "راه‌اندازی میکروفون ناموفق بود.";
}

/** Reads an NDJSON response body line by line. */
async function* readEvents(response: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line);
    }
  }
}

export function useConversation(options: ConversationOptions) {
  const [status, setStatusState] = useState<Status>("idle");
  const [userText, setUserText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);

  const statusRef = useRef<Status>("idle");
  const driverRef = useRef<AvatarDriver | null>(null);
  const vadRef = useRef<MicVADInstance | null>(null);
  const conversationRef = useRef<string | null>(null);
  const turnAbort = useRef<AbortController | null>(null);
  const turnSeq = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastActivity = useRef(0);
  const stopRef = useRef<() => Promise<void>>(async () => {});
  const sessionStarted = useRef(0);

  const setStatus = useCallback((next: Status) => {
    statusRef.current = next;
    if (next !== "listening") lastActivity.current = Date.now();
    setStatusState(next);
  }, []);

  const setDriver = useCallback((driver: AvatarDriver) => {
    driverRef.current = driver;
  }, []);

  const flash = useCallback((message: string) => {
    setNotice(message);
    setTimeout(() => setNotice((current) => (current === message ? null : current)), 6000);
  }, []);

  const listen = useCallback(async () => {
    if (statusRef.current === "idle" || statusRef.current === "error") return;
    setStatus("listening");
    await vadRef.current?.start();
  }, [setStatus]);

  /** Waits until the avatar has finished speaking, unless a newer turn started. */
  const waitForSilence = useCallback(async (seq: number) => {
    while (turnSeq.current === seq && (driverRef.current?.remaining() ?? 0) > 0.05) await sleep(120);
    await sleep(250);
  }, []);

  const runTurn = useCallback(
    async (input: { audio?: Blob; text?: string }) => {
      const conversationId = conversationRef.current;
      const driver = driverRef.current;
      if (!conversationId || !driver) return;

      turnAbort.current?.abort();
      const abort = new AbortController();
      turnAbort.current = abort;
      const seq = ++turnSeq.current;
      if (!optionsRef.current.allowBargeIn) await vadRef.current?.pause();

      setStatus("thinking");
      setAssistantText("");
      setSources([]);
      if (input.text) setUserText(input.text);

      const form = new FormData();
      form.append("conversationId", conversationId);
      if (input.audio) form.append("audio", input.audio, "speech.wav");
      if (input.text) form.append("text", input.text);

      try {
        const response = await fetch("/api/turn", { method: "POST", body: form, signal: abort.signal });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (body.error === "session_expired") {
            await stopRef.current();
            setNotice(body.message);
            return;
          }
          throw new Error(body.message ?? "ارسال پرسش ناموفق بود.");
        }
        for await (const event of readEvents(response)) {
          if (seq !== turnSeq.current) return;
          switch (event.t) {
            case "user":
              setUserText(event.text as string);
              break;
            case "delta":
              setAssistantText((prev) => prev + (event.text as string));
              break;
            case "audio":
              driver.speak(base64ToInt16(event.pcm as string), event.sampleRate as number);
              setStatus("speaking");
              break;
            case "empty":
              flash("صدایتان واضح شنیده نشد؛ لطفاً دوباره بگویید.");
              break;
            case "error":
              flash(event.message as string);
              break;
            case "done":
              setSources((event.sources as string[] | undefined) ?? []);
              break;
          }
        }
        await waitForSilence(seq);
      } catch (error) {
        if (abort.signal.aborted) return;
        flash(error instanceof Error ? error.message : "خطا در گفتگو");
      }
      if (seq === turnSeq.current) await listen();
    },
    [flash, listen, setStatus, waitForSilence],
  );

  const start = useCallback(async () => {
    if (statusRef.current !== "idle" && statusRef.current !== "error") return;
    setStatus("connecting");
    setNotice(null);
    setUserText("");
    setAssistantText("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(window.isSecureContext ? "این مرورگر میکروفون را پشتیبانی نمی‌کند." : "میکروفون فقط روی نشانی https کار می‌کند.");
      }
      const driver = driverRef.current;
      if (!driver) throw new Error("آواتار هنوز آماده نیست.");
      // Still inside the click handler: unlock audio before the first await.
      driver.prepare?.();

      // Create the conversation first: on a first visit this response sets the
      // visitor cookie, which the avatar session below must share. Running the
      // two requests in parallel gave each its own visitor id.
      const conversation = await fetch("/api/conversation", { method: "POST" });
      const conversationBody = await conversation.json();
      if (!conversation.ok) throw new Error(conversationBody.message ?? "شروع گفتگو ناموفق بود.");
      conversationRef.current = conversationBody.id;
      const connecting = driver.connect();
      connecting.catch(() => {}); // awaited below; avoids an unhandled rejection if the microphone step fails
      sessionStarted.current = Date.now();
      lastActivity.current = Date.now();

      const { MicVAD, utils } = await import("@ricky0123/vad-web");
      const opts = optionsRef.current;
      let vad: MicVADInstance;
      try {
        vad = await MicVAD.new({
          model: "v5",
          baseAssetPath: "/vad/",
          onnxWASMBasePath: "/vad/",
          startOnLoad: false,
          positiveSpeechThreshold: opts.speechThreshold,
          negativeSpeechThreshold: Math.max(0.1, opts.speechThreshold - 0.15),
          redemptionMs: opts.silenceMs,
          minSpeechMs: 300,
          preSpeechPadMs: 400,
          submitUserSpeechOnPause: false,
          getStream: () =>
            navigator.mediaDevices.getUserMedia({
              audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            }),
          onSpeechStart: () => {
            const current = statusRef.current;
            if ((current === "speaking" || current === "thinking") && optionsRef.current.allowBargeIn) {
              turnSeq.current++;
              turnAbort.current?.abort();
              driverRef.current?.interrupt();
            }
            if (current !== "idle" && current !== "error") setStatus("hearing");
          },
          onVADMisfire: () => {
            if (statusRef.current === "hearing") setStatus("listening");
          },
          onSpeechEnd: (audio: Float32Array) => {
            const current = statusRef.current;
            if (current === "idle" || current === "error" || current === "connecting") return;
            const seconds = audio.length / 16_000;
            if (seconds > optionsRef.current.maxUtteranceSec) {
              flash("صحبت خیلی طولانی بود؛ لطفاً کوتاه‌تر بپرسید.");
              setStatus("listening");
              return;
            }
            const wav = utils.encodeWAV(audio, 1, 16_000, 1, 16);
            void runTurn({ audio: new Blob([wav], { type: "audio/wav" }) });
          },
        });
      } catch (error) {
        throw new Error(micErrorMessage(error));
      }
      vadRef.current = vad;

      await connecting;
      setStatus("speaking");

      if (opts.greetOnStart) {
        const seq = ++turnSeq.current;
        const greet = await fetch("/api/greet", { method: "POST" }).then((r) => r.json()).catch(() => null);
        if (greet?.pcm) {
          setAssistantText(greet.text);
          driver.speak(base64ToInt16(greet.pcm), greet.sampleRate);
          await waitForSilence(seq);
        } else if (greet?.message) {
          flash(greet.message);
        }
      }
      await listen();
    } catch (error) {
      await vadRef.current?.destroy().catch(() => {});
      vadRef.current = null;
      await driverRef.current?.disconnect().catch(() => {});
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "شروع گفتگو ناموفق بود.");
    }
  }, [flash, listen, runTurn, setStatus, waitForSilence]);

  const stop = useCallback(async () => {
    turnSeq.current++;
    turnAbort.current?.abort();
    setStatus("idle");
    driverRef.current?.interrupt();
    await vadRef.current?.destroy().catch(() => {});
    vadRef.current = null;
    await driverRef.current?.disconnect().catch(() => {});
    conversationRef.current = null;
  }, [setStatus]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Ends idle or over-long conversations: saves cost and, on a kiosk, gives
  // the next visitor a fresh conversation. Only while the avatar is listening.
  useEffect(() => {
    const timer = setInterval(() => {
      if (statusRef.current !== "listening") return;
      const { idleEndSec, maxSessionMin } = optionsRef.current;
      const now = Date.now();
      if (idleEndSec > 0 && now - lastActivity.current > idleEndSec * 1000) {
        void stop().then(() => setNotice("گفتگو به دلیل سکوت پایان یافت. برای ادامه دوباره شروع کنید."));
      } else if (now - sessionStarted.current > maxSessionMin * 60_000) {
        void stop().then(() => setNotice("زمان این گفتگو به پایان رسید. برای ادامه دوباره شروع کنید."));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [stop]);

  const sendText = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean || statusRef.current === "idle" || statusRef.current === "connecting") return;
      lastActivity.current = Date.now();
      if (statusRef.current === "speaking" || statusRef.current === "thinking") {
        turnSeq.current++;
        turnAbort.current?.abort();
        driverRef.current?.interrupt();
      }
      void runTurn({ text: clean });
    },
    [runTurn],
  );

  useEffect(
    () => () => {
      turnAbort.current?.abort();
      void vadRef.current?.destroy();
    },
    [],
  );

  return { status, userText, assistantText, sources, notice, start, stop, sendText, setDriver };
}
