"use client";

import { useEffect, useRef } from "react";

import { PcmPlayer, startLipSync, type MouthPose } from "@/lib/client/audio";

import type { AvatarDriver, PublicAvatarConfig } from "./types";

/**
 * Runs entirely in the browser: no video service, no cost, works from inside
 * Iran. With an uploaded portrait + mouth sprites it swaps only the mouth
 * patch; without them it draws an illustrated face.
 */
export function BuiltinAvatar({
  config,
  onDriver,
}: {
  config: PublicAvatarConfig;
  onDriver: (driver: AvatarDriver) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let player: PcmPlayer | null = null;
    let stopLipSync: (() => void) | null = null;
    const setPose = (pose: MouthPose, level: number) => {
      const el = stageRef.current;
      if (!el) return;
      if (el.dataset.mouth !== pose) el.dataset.mouth = pose;
      el.style.setProperty("--voice", level.toFixed(3));
    };

    onDriver({
      prepare() {
        player ??= new PcmPlayer();
        void player.resume();
      },
      async connect() {
        player ??= new PcmPlayer();
        await player.resume();
        stopLipSync?.();
        stopLipSync = startLipSync(player.analyser, setPose);
      },
      speak(pcm, sampleRate) {
        player?.enqueue(pcm, sampleRate);
      },
      remaining: () => player?.remaining() ?? 0,
      interrupt() {
        player?.stop();
      },
      async disconnect() {
        stopLipSync?.();
        stopLipSync = null;
        await player?.close();
        player = null;
      },
    });
    return () => {
      stopLipSync?.();
      void player?.close();
    };
  }, [onDriver]);

  return (
    <div ref={stageRef} data-mouth="closed" className="builtin-avatar relative h-full">
      {config.portraitUrl ? <PortraitWithMouth config={config} /> : <IllustratedFace />}
    </div>
  );
}

/**
 * The portrait and the three mouth frames are full-size images with identical
 * framing. Each frame is shown only inside the mouth box, so nothing but the
 * mouth ever changes on screen.
 */
export function PortraitWithMouth({ config, showBox }: { config: PublicAvatarConfig; showBox?: boolean }) {
  const { portraitUrl, mouthUrls, mouthBox: box } = config;
  const frameStyle = {
    width: `${(100 / box.w) * 100}%`,
    height: `${(100 / box.h) * 100}%`,
    right: "auto",
    left: `${(-box.x / box.w) * 100}%`,
    top: `${(-box.y / box.h) * 100}%`,
  } as const;
  return (
    <div className="relative h-full w-fit overflow-hidden rounded-[2rem]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={portraitUrl!} alt="" className="block h-full w-auto max-w-none select-none" draggable={false} />
      <div
        className={`mouth-window ${showBox ? "outline-2 outline-dashed outline-accent" : ""}`}
        style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
        aria-hidden
      >
        {mouthUrls &&
          (["soft", "round", "open"] as const).map((pose) => (
            <div key={pose} className={`mouth-frame mouth-frame--${pose}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mouthUrls[pose]} alt="" style={frameStyle} draggable={false} />
            </div>
          ))}
      </div>
    </div>
  );
}

function IllustratedFace() {
  return (
    <svg viewBox="0 0 300 400" className="aspect-[3/4] h-full w-auto" aria-hidden>
      <defs>
        <radialGradient id="skin" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#f3d2b8" />
          <stop offset="100%" stopColor="#d9a888" />
        </radialGradient>
        <linearGradient id="suit" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#23324a" />
          <stop offset="100%" stopColor="#141c2b" />
        </linearGradient>
      </defs>
      <path d="M40 400 C50 320 100 295 150 295 C200 295 250 320 260 400 Z" fill="url(#suit)" />
      <path d="M128 296 L150 335 L172 296 Z" fill="#e9eef5" />
      <rect x="132" y="250" width="36" height="50" rx="14" fill="#d4a283" />
      <ellipse cx="150" cy="170" rx="82" ry="100" fill="url(#skin)" />
      <path d="M68 150 C66 80 110 58 150 58 C196 58 236 84 232 150 C222 112 196 100 150 100 C108 100 80 112 68 150 Z" fill="#2b211c" />
      <g className="face-eyes">
        <ellipse cx="118" cy="172" rx="9" ry="10" fill="#2b211c" />
        <ellipse cx="182" cy="172" rx="9" ry="10" fill="#2b211c" />
      </g>
      <path d="M100 150 Q118 140 136 148" stroke="#2b211c" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M164 148 Q182 140 200 150" stroke="#2b211c" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M150 185 Q145 210 152 214" stroke="#b98468" strokeWidth="4" fill="none" strokeLinecap="round" />
      <g transform="translate(150 236)">
        <ellipse className="face-mouth" cx="0" cy="0" rx="22" ry="3" fill="#7a2f2f" />
      </g>
    </svg>
  );
}
