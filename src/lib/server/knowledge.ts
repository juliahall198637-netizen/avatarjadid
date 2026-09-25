import { chunkPersianText, keywordTokens, normalizePersian } from "@/lib/persian";

import { ApiError } from "./api";
import { db } from "./db";
import { describeError } from "./http";
import { embed } from "./providers/embeddings";
import { providerFor } from "./providers/registry";
import { getSettings } from "./settings";

export interface RetrievedChunk {
  content: string;
  title: string;
  score: number;
}

const MAX_DOCUMENT_CHARS = 400_000;

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await pdfText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join("\n\n");
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) return file.text();
  throw new ApiError(400, "unsupported_file", "فقط فایل PDF، TXT یا MD پشتیبانی می‌شود.");
}

/** Stores a document, chunks it and (when configured) embeds the chunks. */
export async function addDocument(title: string, source: string, rawText: string): Promise<{ id: string; warning?: string }> {
  const text = normalizePersian(rawText);
  if (text.length < 20) throw new ApiError(400, "empty_document", "متن سند خالی یا خیلی کوتاه است. (PDFهای اسکن‌شده متن قابل‌استخراج ندارند.)");
  if (text.length > MAX_DOCUMENT_CHARS) throw new ApiError(400, "too_large", "سند بیش از حد بزرگ است؛ آن را به چند فایل تقسیم کنید.");
  const chunks = chunkPersianText(text, { maxChars: 900, overlap: 120 });

  let embeddings: number[][] | null = null;
  let model: string | null = null;
  let warning: string | undefined;
  const settings = await getSettings();
  if (settings.embeddings) {
    try {
      const provider = await providerFor(settings.embeddings.providerId, "embeddings");
      embeddings = await embed(provider, settings.embeddings.model, chunks);
      model = `${provider.id}:${settings.embeddings.model}`;
    } catch (error) {
      warning = `سند ذخیره شد ولی بردارسازی انجام نشد؛ جست‌وجوی کلیدواژه‌ای استفاده می‌شود. (${describeError(error)})`;
    }
  }

  const sql = db();
  const id = await sql.begin(async (tx) => {
    const [doc] = await tx`
      insert into knowledge_documents (title, source, chunk_count, char_count)
      values (${title}, ${source}, ${chunks.length}, ${text.length}) returning id`;
    for (let i = 0; i < chunks.length; i++) {
      await tx`
        insert into knowledge_chunks (document_id, idx, content, embedding, embedding_model)
        values (${doc!.id}, ${i}, ${chunks[i]!}, ${embeddings ? embeddings[i]! : null}, ${model})`;
    }
    return doc!.id as string;
  });
  return { id, warning };
}

/** Re-embeds every chunk with the currently configured embedding model. */
export async function reindexAll(): Promise<number> {
  const settings = await getSettings();
  if (!settings.embeddings) throw new ApiError(400, "no_embeddings", "ابتدا سرویس بردارسازی را در تنظیمات انتخاب کنید.");
  const provider = await providerFor(settings.embeddings.providerId, "embeddings");
  const model = `${provider.id}:${settings.embeddings.model}`;
  const rows = await db()`select id, content from knowledge_chunks order by id`;
  for (let i = 0; i < rows.length; i += 64) {
    const batch = rows.slice(i, i + 64);
    const vectors = await embed(provider, settings.embeddings.model, batch.map((r) => r.content as string));
    for (let j = 0; j < batch.length; j++) {
      await db()`update knowledge_chunks set embedding = ${vectors[j]!}, embedding_model = ${model} where id = ${batch[j]!.id}`;
    }
  }
  return rows.length;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Finds the most relevant chunks. Uses embeddings when every stored chunk was
 * embedded with the current model; otherwise falls back to keyword overlap.
 * Linear scan in memory — fine for the few thousand chunks a Q&A assistant holds.
 */
export async function retrieve(question: string, limit = 4, signal?: AbortSignal): Promise<RetrievedChunk[]> {
  const settings = await getSettings();
  const rows = await db()`
    select c.content, c.embedding, c.embedding_model, d.title
    from knowledge_chunks c join knowledge_documents d on d.id = c.document_id
    where d.active`;
  if (!rows.length) return [];

  if (settings.embeddings) {
    const model = `${settings.embeddings.providerId}:${settings.embeddings.model}`;
    if (rows.every((r) => r.embedding_model === model && r.embedding)) {
      try {
        const provider = await providerFor(settings.embeddings.providerId, "embeddings");
        const [query] = await embed(provider, settings.embeddings.model, [normalizePersian(question)], signal);
        return rows
          .map((r) => ({ content: r.content as string, title: r.title as string, score: cosine(query!, r.embedding as number[]) }))
          .filter((r) => r.score >= 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      } catch (error) {
        console.warn("[knowledge] embedding search failed, using keywords:", describeError(error));
      }
    }
  }

  const query = new Set(keywordTokens(question));
  if (!query.size) return [];
  return rows
    .map((r) => {
      const tokens = keywordTokens(r.content as string);
      const hits = tokens.filter((t) => query.has(t)).length;
      const distinct = new Set(tokens.filter((t) => query.has(t))).size;
      return { content: r.content as string, title: r.title as string, score: distinct / query.size + Math.min(hits, 10) * 0.01 };
    })
    .filter((r) => r.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
