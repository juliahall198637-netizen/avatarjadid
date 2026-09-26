"use client";

import { useEffect, useRef } from "react";

import { int16ToBase64, resample } from "@/lib/client/audio";

import type { AvatarDriver } from "./types";

// Simli, HeyGen LiveAvatar and D-ID render a real video face. Our server has
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

async function didCall(body: Record<string, unknown>) {
  const response = await fetch("/api/avatar/did", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? "ارتباط با D-ID ناموفق بود.");
  return data as { duration?: number };
}

function waitConnected(pc: RTCPeerConnection, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    if (pc.connectionState === "connected") return resolve();
    const timer = setTimeout(() => reject(new Error("اتصال تصویری آواتار برقرار نشد.")), timeoutMs);
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") {
        clearTimeout(timer);
        resolve();
      } else if (pc.connectionState === "failed") {
        clearTimeout(timer);
        reject(new Error("اتصال تصویری آواتار قطع شد."));
      }
    });
  });
}

/**
 * D-ID plays each clip as a separate "talk" (audio upload + request), which
 * costs about a second. The first sentence goes out alone for a fast start;
 * sentences that arrive while a clip is playing are merged into the next one.
 */
function createDidDriver(video: () => HTMLVideoElement | null, poster: () => HTMLImageElement | null): AvatarDriver {
  const RATE = 24_000;
  const START_LATENCY = 1.0;
  let token = "";
  let pc: RTCPeerConnection | null = null;
  let queue: Int16Array[] = [];
  let busyUntil = 0;
  let inFlight = 0;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let statsTimer: ReturnType<typeof setInterval> | null = null;
  const now = () => performance.now() / 1000;
  const seconds = (pcm: Int16Array) => pcm.length / RATE;

  const pump = () => {
    if (inFlight || !queue.length || !token) return;
    const wait = busyUntil - now();
    if (wait > 0.05) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(pump, wait * 1000);
      return;
    }
    const total = queue.reduce((n, p) => n + p.length, 0);
    const merged = new Int16Array(total);
    let offset = 0;
    for (const part of queue) {
      merged.set(part, offset);
      offset += part.length;
    }
    queue = [];
    const gen = generation;
    inFlight = seconds(merged) + START_LATENCY;
    didCall({ action: "talk", token, pcm: int16ToBase64(merged), sampleRate: RATE })
      .then((result) => {
        if (gen !== generation) return;
        busyUntil = Math.max(now(), busyUntil) + START_LATENCY + (result.duration ?? seconds(merged));
      })
      .catch(() => {
        if (gen === generation) busyUntil = 0;
      })
      .finally(() => {
        if (gen !== generation) return;
        inFlight = 0;
        pump();
      });
  };

  return {
    async connect() {
      const session = await openSession();
      token = session.token as string;
      const img = poster();
      if (img && session.posterUrl) img.src = session.posterUrl as string;
      pc = new RTCPeerConnection({ iceServers: session.iceServers as RTCIceServer[] });
      pc.addEventListener("icecandidate", (event) => {
        if (!event.candidate) return;
        void didCall({
          action: "ice",
          token,
          candidate: { candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex },
        }).catch(() => {});
      });
      pc.addEventListener("track", (event) => {
        const el = video();
        if (el && event.streams[0] && el.srcObject !== event.streams[0]) el.srcObject = event.streams[0];
      });
      await pc.setRemoteDescription(session.offer as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await didCall({ action: "sdp", token, answer: { type: "answer", sdp: answer.sdp } });
      await waitConnected(pc, 20_000);

      // Show the still portrait whenever no video frames are arriving (between talks).
      let lastBytes = 0;
      statsTimer = setInterval(async () => {
        if (!pc) return;
        let bytes = 0;
        (await pc.getStats()).forEach((report) => {
          if (report.type === "inbound-rtp" && report.kind === "video") bytes = report.bytesReceived ?? 0;
        });
        const playing = bytes > lastBytes;
        lastBytes = bytes;
        const el = video();
        if (el) el.style.opacity = playing ? "1" : "0";
      }, 400);
    },
    speak(pcm, sampleRate) {
      queue.push(resample(pcm, sampleRate, RATE));
      pump();
    },
    remaining() {
      const queued = queue.reduce((n, p) => n + seconds(p), 0);
      return Math.max(0, busyUntil - now()) + inFlight + queued + (queued ? START_LATENCY : 0);
    },
    interrupt() {
      generation++;
      queue = [];
      busyUntil = 0;
      inFlight = 0;
      if (timer) clearTimeout(timer);
    },
    async disconnect() {
      generation++;
      queue = [];
      if (timer) clearTimeout(timer);
      if (statsTimer) clearInterval(statsTimer);
      if (token) await didCall({ action: "close", token }).catch(() => {});
      pc?.close();
      pc = null;
      token = "";
    },
  };
}

/**
 * Beyond Presence over LiveKit, using the protocol of LiveKit's official
 * avatar plugins: our PCM goes to the avatar participant as a byte stream on
 * topic "lk.audio_stream" (one stream per utterance), "lk.clear_buffer"
 * interrupts, and the avatar reports "lk.playback_finished".
 */
function createBeyDriver(video: () => HTMLVideoElement | null, audio: () => HTMLAudioElement | null): AvatarDriver {
  const RATE = 24_000;
  const clock = new SpeechClock();
  type LkRoom = import("livekit-client").Room;
  type LkWriter = Awaited<ReturnType<LkRoom["localParticipant"]["streamBytes"]>>;
  let room: LkRoom | null = null;
  let avatarIdentity = "";
  let writer: Promise<LkWriter> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const closeUtterance = () => {
    const current = writer;
    writer = null;
    if (current) chain = chain.then(() => current.then((w) => w.close())).catch(() => {});
  };

  return {
    async connect() {
      const session = await openSession();
      avatarIdentity = session.avatarIdentity as string;
      const { Room, RoomEvent, Track } = await import("livekit-client");
      room = new Room({ adaptiveStream: true });
      const avatarVideo = new Promise<void>((resolve) => {
        room!.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
          if (participant.identity !== avatarIdentity) return;
          if (track.kind === Track.Kind.Video && video()) {
            track.attach(video()!);
            resolve();
          } else if (track.kind === Track.Kind.Audio && audio()) {
            track.attach(audio()!);
          }
        });
      });
      room.registerRpcMethod("lk.playback_finished", async () => {
        if (!writer) clock.reset();
        return "ok";
      });
      await room.connect(session.url as string, session.token as string);
      await room.startAudio().catch(() => {});
      await Promise.race([
        avatarVideo,
        new Promise((_, reject) => setTimeout(() => reject(new Error("آواتار Beyond Presence به اتاق وارد نشد.")), 45_000)),
      ]);
    },
    speak(pcm, sampleRate) {
      if (!room) return;
      const lk = room;
      const data = resample(pcm, sampleRate, RATE);
      writer ??= lk.localParticipant.streamBytes({
        name: `AUDIO_${Date.now()}`,
        topic: "lk.audio_stream",
        destinationIdentities: [avatarIdentity],
        attributes: { sample_rate: String(RATE), num_channels: "1" },
      });
      const current = writer;
      chain = chain
        .then(() => current)
        .then((w) => w.write(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)))
        .catch(() => {});
      clock.add(data.length / RATE, 0.5);
      // Sentences arriving close together form one utterance; a pause ends it.
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(closeUtterance, 700);
    },
    remaining: () => clock.remaining(),
    interrupt() {
      if (closeTimer) clearTimeout(closeTimer);
      closeUtterance();
      clock.reset();
      void room?.localParticipant.performRpc({ destinationIdentity: avatarIdentity, method: "lk.clear_buffer", payload: "" }).catch(() => {});
    },
    async disconnect() {
      if (closeTimer) clearTimeout(closeTimer);
      writer = null;
      clock.reset();
      await room?.disconnect().catch(() => {});
      room = null;
    },
  };
}

export function StreamingAvatar({
  type,
  onDriver,
}: {
  type: "simli" | "liveavatar" | "did" | "bey";
  onDriver: (driver: AvatarDriver) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (type === "bey") {
      const driver = createBeyDriver(
        () => videoRef.current,
        () => audioRef.current,
      );
      onDriver(driver);
      return () => void driver.disconnect();
    }
    if (type === "did") {
      const driver = createDidDriver(
        () => videoRef.current,
        () => posterRef.current,
      );
      onDriver(driver);
      return () => void driver.disconnect();
    }

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={posterRef} alt="" className={`absolute inset-0 h-full w-full object-cover ${type === "did" ? "" : "hidden"}`} />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="relative h-full w-full object-cover transition-opacity duration-300"
        style={type === "did" ? { opacity: 0 } : undefined}
      />
      <audio ref={audioRef} autoPlay />
    </div>
  );
}
