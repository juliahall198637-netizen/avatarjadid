// Every avatar renderer implements this so the conversation engine never
// cares which service (or none) is drawing the face.

export interface AvatarDriver {
  /** Connects to the rendering service. Called once, from a user gesture. */
  connect(): Promise<void>;
  /** Queues one sentence of PCM16 mono speech. */
  speak(pcm: Int16Array, sampleRate: number): void;
  /** Seconds until everything queued has been spoken (best estimate). */
  remaining(): number;
  /** Stops speaking immediately (barge-in or end of conversation). */
  interrupt(): void;
  disconnect(): Promise<void>;
}

export interface PublicAvatarConfig {
  type: "builtin" | "simli" | "liveavatar";
  portraitUrl: string | null;
  mouthUrls: { soft: string; round: string; open: string } | null;
  mouthBox: { x: number; y: number; w: number; h: number };
}
