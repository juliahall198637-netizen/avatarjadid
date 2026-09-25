"use client";

import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api, attempt, Badge, Button, Card, cx, formatDate } from "./ui";

interface Conversation {
  id: string;
  created_at: string;
  last_activity_at: string;
  message_count: number;
  first_question: string | null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  meta: { source?: string; sources?: string[]; policy?: string; latencyMs?: number; audioError?: string };
  created_at: string;
}

const SOURCE: Record<string, string> = { knowledge: "پایگاه دانش", general: "دانش عمومی", fallback: "پاسخ ثابت", policy: "موضوع ممنوع" };

export function ConversationsTab() {
  const [list, setList] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const load = useCallback(async () => {
    await attempt(async () => setList(await api<Conversation[]>("/api/admin/conversations")));
  }, []);
  useEffect(() => void load(), [load]);

  async function open(id: string) {
    setSelected(id);
    const rows = await attempt(() => api<Message[]>(`/api/admin/conversations/${id}`));
    if (rows) setMessages(rows);
  }

  async function remove(id: string) {
    if (!confirm("این گفتگو حذف شود؟")) return;
    await attempt(() => api(`/api/admin/conversations/${id}`, { method: "DELETE" }), "حذف شد.");
    setSelected(null);
    await load();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <Card
        title={`آخرین گفتگوها (${list.length})`}
        actions={
          <Button variant="ghost" className="px-2 py-1 text-xs text-accent" onClick={() => (window.location.href = "/api/admin/conversations/export")}>
            <Download className="size-3.5" /> خروجی CSV
          </Button>
        }
      >
        {list.length === 0 && <p className="text-sm text-muted">هنوز گفتگویی ثبت نشده است.</p>}
        <ul className="-mx-2 max-h-[70vh] space-y-1 overflow-auto">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => open(c.id)}
                className={cx("w-full rounded-lg px-2 py-2 text-right transition", selected === c.id ? "bg-white/10" : "hover:bg-white/5")}
              >
                <p className="truncate text-sm">{c.first_question ?? "—"}</p>
                <p className="text-xs text-muted">
                  {formatDate(c.last_activity_at)} · {c.message_count} پیام
                </p>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="جزئیات"
        actions={
          selected && (
            <Button variant="ghost" onClick={() => remove(selected)}>
              <Trash2 className="size-4" /> حذف
            </Button>
          )
        }
      >
        {!selected ? (
          <p className="text-sm text-muted">یک گفتگو را انتخاب کنید.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cx("rounded-xl p-3 text-sm leading-7", m.role === "user" ? "bg-white/5" : "border border-line")}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{m.role === "user" ? "بازدیدکننده" : "دستیار"}</span>
                  {m.meta.source && (
                    <Badge tone={m.meta.source === "knowledge" ? "ok" : m.meta.source === "policy" ? "warn" : "neutral"}>{SOURCE[m.meta.source] ?? m.meta.source}</Badge>
                  )}
                  {m.meta.sources && m.meta.sources.length > 0 && <span>منبع: {m.meta.sources.join("، ")}</span>}
                  {m.meta.latencyMs !== undefined && <span>{(m.meta.latencyMs / 1000).toFixed(1)} ثانیه</span>}
                  {m.meta.audioError && <Badge tone="bad">خطای صدا</Badge>}
                </div>
                {m.content}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
