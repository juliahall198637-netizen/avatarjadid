// Every avatar renderer implements this so the conversation engine never
// cares which service (or none) is drawing the face.

export interface AvatarDriver {
  /**
   * Synchronous work that must happen inside the click handler itself, such as
   * unlocking audio playback (iOS Safari refuses it after any await).
   */
  prepare?(): void;
  /** Connects to the rendering service. Called once per conversation. */
  connect(): Promise<void>;
  /** Queues one sentence of PCM16 mono speech. */
  speak(pcm: Int16Array, sampleRate: number): void;
  /** Seconds until everything queued has been spoken (best estimate). */
  remaining(): number;
  /** Stops speaking immediately (barge-in or end of conversation). */
  interrupt(): void;
  disconnect(): Promise<void>;
}

export interface DidEmbedConfig {
  clientKey: string;
  agentId: string;
  scriptUrl: string;
  mode: "full" | "fabio";
  orientation: "vertical" | "horizontal";
  position: "center" | "left" | "right";
  monitor: boolean;
}

export interface PublicAvatarConfig {
  type: "builtin" | "simli" | "liveavatar" | "did" | "bey" | "did_embed";
  /** Only for type "did_embed". The client key is public by design (D-ID restricts it by domain). */
  didEmbed?: DidEmbedConfig;
  portraitUrl: string | null;
  mouthUrls: { soft: string; round: string; open: string } | null;
  mouthBox: { x: number; y: number; w: number; h: number };
}
