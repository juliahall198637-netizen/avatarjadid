// Browser audio helpers. The server always sends PCM16 mono at 24 kHz.

export function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, bytes.byteLength >> 1);
}

export function int16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Linear-interpolation resampler; good enough for speech. */
export function resample(pcm: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return pcm;
  const ratio = from / to;
  const out = new Int16Array(Math.floor(pcm.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const frac = pos - index;
    const a = pcm[index] ?? 0;
    const b = pcm[index + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export function durationSec(pcm: Int16Array, sampleRate: number) {
  return pcm.length / sampleRate;
}

/**
 * Gapless queue player built on Web Audio. Exposes an AnalyserNode so the
 * built-in avatar can drive its mouth from the audio actually being played.
 */
export class PcmPlayer {
  readonly context: AudioContext;
  readonly analyser: AnalyserNode;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(context?: AudioContext) {
    this.context = context ?? new AudioContext({ latencyHint: "interactive" });
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.45;
    this.analyser.connect(this.context.destination);
  }

  async resume() {
    if (this.context.state !== "running") await this.context.resume().catch(() => {});
  }

  /** Queues audio; returns the context time at which it will finish. */
  enqueue(pcm: Int16Array, sampleRate: number): number {
    const buffer = this.context.createBuffer(1, pcm.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i]! / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);
    const start = Math.max(this.context.currentTime + 0.05, this.nextStart);
    source.start(start);
    this.nextStart = start + buffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
    return this.nextStart;
  }

  /** Seconds of queued audio still to play. */
  remaining(): number {
    return Math.max(0, this.nextStart - this.context.currentTime);
  }

  stop() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* not started yet */
      }
    }
    this.sources.clear();
    this.nextStart = 0;
  }

  async close() {
    this.stop();
    await this.context.close().catch(() => {});
  }
}

export type MouthPose = "closed" | "soft" | "round" | "open";
const POSES: MouthPose[] = ["closed", "soft", "round", "open"];
const POSE_INTERVAL_MS = 96;

/**
 * Drives mouth poses from an analyser (approach from the talking-avatar
 * skill): smoothed RMS envelope, rolling-peak normalisation, poses change at
 * most every ~96 ms and only step to adjacent shapes.
 */
export function startLipSync(analyser: AnalyserNode, onPose: (pose: MouthPose, level: number) => void): () => void {
  const samples = new Uint8Array(analyser.fftSize);
  let envelope = 0;
  let rollingPeak = 0.055;
  let current: MouthPose = "closed";
  let sampled = 0;
  let lastUpdate = 0;
  let silenceSince: number | null = null;
  let frame = 0;

  const tick = (now: number) => {
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const s of samples) {
      const n = (s - 128) / 128;
      energy += n * n;
    }
    const rms = Math.sqrt(energy / samples.length);
    envelope += (rms - envelope) * (rms >= envelope ? 0.38 : 0.12);
    rollingPeak = Math.max(envelope, rollingPeak * 0.997, 0.035);
    const level = Math.max(0, Math.min(1, (envelope - 0.012) / Math.max(rollingPeak - 0.012, 0.025)));
    sampled = Math.max(level, sampled * 0.88);
    silenceSince = rms < 0.013 ? (silenceSince ?? now) : null;

    const target: MouthPose =
      silenceSince !== null && now - silenceSince >= 120
        ? "closed"
        : sampled < 0.12
          ? "closed"
          : sampled < 0.4
            ? "soft"
            : sampled < 0.78
              ? "round"
              : "open";

    if (now - lastUpdate >= POSE_INTERVAL_MS) {
      const ci = POSES.indexOf(current);
      const ti = POSES.indexOf(target);
      const longSilence = silenceSince !== null && now - silenceSince >= 170;
      const next = POSES[longSilence ? 0 : ci + Math.sign(ti - ci)]!;
      if (next !== current) current = next;
      onPose(current, sampled);
      sampled = level;
      lastUpdate = now;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    onPose("closed", 0);
  };
}
