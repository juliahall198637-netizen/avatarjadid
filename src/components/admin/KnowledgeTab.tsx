"use client";

import { FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAdmin } from "./AdminPanel";
import { api, attempt, Badge, Button, Card, Field, formatDate, Input, Textarea } from "./ui";

interface Doc {
  id: string;
  title: string;
  source: string;
  chunk_count: number;
  char_count: number;
  embedded: number;
  created_at: string;
}

export function KnowledgeTab() {
  const { settings } = useAdmin();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; chunks: { idx: number; content: string }[] } | null>(null);

  const load = useCallback(async () => {
    await attempt(async () => setDocs(await api<Doc[]>("/api/admin/knowledge")));
  }, []);
  useEffect(() => void load(), [load]);

  async function submit(form: FormData, key: string) {
    setBusy(key);
    const result = await attempt(() => api<{ id: string; warning?: string }>("/api/admin/knowledge", { method: "POST", body: form }), "سند اضافه شد.");
    if (result?.warning) alert(result.warning);
    setBusy(null);
    await load();
    return Boolean(result);
  }

  async function uploadFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      await submit(form, "file");
    }
  }

  async function addText() {
    const form = new FormData();
    form.append("title", title);
    form.append("text", text);
    if (await submit(form, "text")) {
      setTitle("");
      setText("");
    }
  }

  async function reindex() {
    setBusy("reindex");
    const result = await attempt(() => api<{ chunks: number }>("/api/admin/knowledge/reindex", { method: "POST" }));
    if (result) alert(`${result.chunks} قطعه دوباره بردارسازی شد.`);
    setBusy(null);
    await load();
  }

  async function remove(doc: Doc) {
    if (!confirm(`سند «${doc.title}» حذف شود؟`)) return;
    await attempt(() => api(`/api/admin/knowledge/${doc.id}`, { method: "DELETE" }), "حذف شد.");
    await load();
  }

  async function toggle(doc: Doc) {
    if (open?.id === doc.id) return setOpen(null);
    const chunks = await attempt(() => api<{ idx: number; content: string }[]>(`/api/admin/knowledge/${doc.id}`));
    if (chunks) setOpen({ id: doc.id, chunks });
  }

  return (
    <div className="space-y-5">
      <Card
        title="افزودن دانش"
        description="پرسش‌وپاسخ‌های متداول، معرفی سازمان، ساعت کاری، قوانین و… را اضافه کنید تا دستیار دقیق و مستند پاسخ دهد. PDFهای اسکن‌شده (تصویری) متن قابل‌استخراج ندارند."
        actions={
          settings!.embeddings && (
            <Button variant="outline" busy={busy === "reindex"} onClick={reindex}>
              <RefreshCw className="size-4" /> بازسازی بردارها
            </Button>
          )
        }
      >
        <div className="grid gap-5 md:grid-cols-2">
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line p-6 text-center transition hover:bg-white/5">
            <Upload className="size-6 text-accent" />
            <span className="text-sm">{busy === "file" ? "در حال پردازش…" : "بارگذاری فایل PDF، TXT یا MD"}</span>
            <span className="text-xs text-muted">حداکثر ۲۵ مگابایت</span>
            <input type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain" className="hidden" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
          </label>
          <div className="space-y-3">
            <Field label="عنوان">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: ساعات کاری و آدرس" />
            </Field>
            <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="متن را اینجا بنویسید یا بچسبانید…" />
            <Button busy={busy === "text"} disabled={!title || text.trim().length < 20} onClick={addText}>
              افزودن متن
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`اسناد (${docs.length})`}>
        {docs.length === 0 && <p className="text-sm text-muted">هنوز سندی اضافه نشده است.</p>}
        <ul className="divide-y divide-line">
          {docs.map((doc) => (
            <li key={doc.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => toggle(doc)} className="flex min-w-0 items-center gap-2 text-right">
                  <FileText className="size-4 shrink-0 text-muted" />
                  <span className="truncate text-sm">{doc.title}</span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge>{doc.chunk_count} قطعه</Badge>
                  {settings!.embeddings && (
                    <Badge tone={doc.embedded === doc.chunk_count ? "ok" : "warn"}>{doc.embedded === doc.chunk_count ? "بردارسازی شده" : "بدون بردار"}</Badge>
                  )}
                  <span className="hidden text-xs text-muted sm:inline">{formatDate(doc.created_at)}</span>
                  <Button variant="ghost" onClick={() => remove(doc)} aria-label="حذف">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {open?.id === doc.id && (
                <div className="mt-3 max-h-80 space-y-2 overflow-auto rounded-lg bg-ink/50 p-3">
                  {open.chunks.map((c) => (
                    <p key={c.idx} className="whitespace-pre-wrap border-b border-line/60 pb-2 text-xs leading-6 text-white/75">
                      {c.content}
                    </p>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
