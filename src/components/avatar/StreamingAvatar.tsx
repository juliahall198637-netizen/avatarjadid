"use client";

import { useEffect, useRef } from "react";

import { int16ToBase64, resample } from "@/lib/client/audio";

import type { AvatarDriver } from "./types";

// Simli and HeyGen LiveAvatar render a real video face. Our server has
// already produced the Persian speech; these services only lip-sync to it.

async function openSession(): Promise<Record<string, unknown>> {
  const response = await fetch("/api/avatar-session", { method: "POST" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "اتصال به سرویس آواتار برقرار نشد.");
  return body;
}

/** Tracks when queued speech will finish, for services without a reliable "done" event. */
class SpeechClock {
  private end = 0;
  add(seconds: number, latency: number) {
    const now = performance.now() / 1000;
    this.end = Math.max(this.end, now + latency) + seconds;
  }
  remaining() {
    return Math.max(0, this.end - performance.now() / 1000);
  }
  reset() {
    this.end = 0;
  }
}

export function StreamingAvatar({
  type,
  onDriver,
}: {
  type: "simli" | "liveavatar";
  onDriver: (driver: AvatarDriver) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const clock = new SpeechClock();
    let stop: () => Promise<void> = async () => {};
    let send: (pcm: Int16Array, rate: number) => void = () => {};
    let clear: () => void = () => {};

    onDriver({
      async connect() {
        const session = await openSession();
        if (type === "simli") {
          // Deep import: the package index requires "./Client" but ships
          // "client.js", which breaks on case-sensitive Linux file systems.
          const { SimliClient, LogLevel } = await import("simli-client/dist/client");
          const client = new SimliClient(
            session.sessionToken as string,
            videoRef.current!,
            audioRef.current!,
            session.iceServers as RTCIceServer[],
            LogLevel.ERROR,
          );
          await client.start();
          // Simli wants PCM16 mono at 16 kHz.
          send = (pcm, rate) => {
            const pcm16k = resample(pcm, rate, 16_000);
            const bytes = new Uint8Array(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength);
            for (let i = 0; i < bytes.length; i += 6000) client.sendAudioData(bytes.slice(i, i + 6000));
          };
          clear = () => client.ClearBuffer();
          stop = () => client.stop();
        } else {
          const { LiveAvatarSession, SessionEvent } = await import("@heygen/liveavatar-web-sdk");
          const live = new LiveAvatarSession(session.sessionToken as string, {
            autoKeepAlive: true,
            voiceChat: { defaultMuted: true },
          });
          live.on(SessionEvent.SESSION_STREAM_READY, () => {
            if (videoRef.current) live.attach(videoRef.current);
          });
          await live.start();
          // LITE mode takes base64 PCM16 mono at 24 kHz.
          send = (pcm, rate) => live.repeatAudio(int16ToBase64(resample(pcm, rate, 24_000)));
          clear = () => live.interrupt();
          stop = () => live.stop();
        }
      },
      speak(pcm, sampleRate) {
        send(pcm, sampleRate);
        clock.add(pcm.length / sampleRate, 0.6);
      },
      remaining: () => clock.remaining(),
      interrupt() {
        clear();
        clock.reset();
      },
      async disconnect() {
        await stop().catch(() => {});
      },
    });
    return () => {
      void stop().catch(() => {});
    };
  }, [type, onDriver]);

  return (
    <div className="relative aspect-[3/4] h-full max-h-full overflow-hidden rounded-[2rem] bg-black/40">
      <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
      <audio ref={audioRef} autoPlay />
    </div>
  );
}
