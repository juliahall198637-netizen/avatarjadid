// Cost-free stand-ins so the whole voice loop can be exercised without real
// keys. Enabled only with ENABLE_MOCK_PROVIDERS=1.

export const MOCK_SAMPLE_RATE = 24_000;

export function mockTranscript(config: Record<string, unknown>): string {
  return typeof config.transcript === "string" && config.transcript
    ? config.transcript
    : "سلام، ساعت کاری شما چیست؟";
}

export async function* mockChat(question: string, context: string): AsyncGenerator<string> {
  const answer = context
    ? `بر اساس اطلاعاتی که دارم، ${context.slice(0, 120).replace(/\s+/g, " ")}. سوال دیگری دارید؟`
    : `پرسیدید «${question.slice(0, 80)}». این یک پاسخ آزمایشی است. سوال دیگری دارید؟`;
  for (const word of answer.split(/(\s+)/)) {
    await new Promise((r) => setTimeout(r, 8));
    yield word;
  }
}

/** A voiced tone with syllable-like amplitude bursts, so lip sync visibly moves. */
export function mockSpeech(text: string): Buffer {
  const seconds = Math.min(8, 0.4 + text.length * 0.055);
  const samples = Math.floor(seconds * MOCK_SAMPLE_RATE);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / MOCK_SAMPLE_RATE;
    const syllable = Math.max(0, Math.sin(Math.PI * 4.5 * t)) ** 1.5;
    const tone = Math.sin(2 * Math.PI * 180 * t) * 0.6 + Math.sin(2 * Math.PI * 360 * t) * 0.25;
    pcm.writeInt16LE(Math.round(tone * syllable * 9000), i * 2);
  }
  return pcm;
}

export function mockEmbedding(text: string): number[] {
  // Deterministic bag-of-characters vector; enough to exercise retrieval code.
  const v = new Array(64).fill(0);
  for (const ch of text) v[ch.codePointAt(0)! % 64] += 1;
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}
