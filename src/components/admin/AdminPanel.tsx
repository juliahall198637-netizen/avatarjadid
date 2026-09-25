"use client";

import { BookOpen, Bot, Cpu, ExternalLink, KeyRound, LayoutDashboard, LogOut, MessagesSquare, Shield, UserRound } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import type { ProviderSummary } from "@/lib/server/providers/registry";
import type { AppSettings } from "@/lib/server/settings";

import { AvatarTab } from "./AvatarTab";
import { ConversationsTab } from "./ConversationsTab";
import { KnowledgeTab } from "./KnowledgeTab";
import { OverviewTab } from "./OverviewTab";
import { PersonaTab } from "./PersonaTab";
import { PipelineTab } from "./PipelineTab";
import { ProvidersTab } from "./ProvidersTab";
import { SecurityTab } from "./SecurityTab";
import { api, attempt, Button, cx } from "./ui";

interface AdminState {
  settings: AppSettings | null;
  update: (fn: (draft: AppSettings) => void) => void;
  dirty: boolean;
  save: () => Promise<void>;
  saving: boolean;
  providers: ProviderSummary[];
  reloadProviders: () => Promise<void>;
  mockEnabled: boolean;
}

const AdminContext = createContext<AdminState | null>(null);

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin outside AdminPanel");
  return value;
}

const TABS = [
  { id: "overview", label: "نمای کلی", icon: LayoutDashboard, render: () => <OverviewTab /> },
  { id: "providers", label: "سرویس‌ها و کلیدها", icon: KeyRound, render: () => <ProvidersTab /> },
  { id: "pipeline", label: "مغز و صدا", icon: Cpu, render: () => <PipelineTab /> },
  { id: "avatar", label: "آواتار", icon: UserRound, render: () => <AvatarTab /> },
  { id: "persona", label: "شخصیت و رفتار", icon: Bot, render: () => <PersonaTab /> },
  { id: "knowledge", label: "پایگاه دانش", icon: BookOpen, render: () => <KnowledgeTab /> },
  { id: "conversations", label: "گفتگوها", icon: MessagesSquare, render: () => <ConversationsTab /> },
  { id: "security", label: "شبکه و امنیت", icon: Shield, render: () => <SecurityTab /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminPanel({ email, mockEnabled }: { email: string; mockEnabled: boolean }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as TabId;
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
    void attempt(async () => {
      const loaded = await api<AppSettings>("/api/admin/settings");
      setSettings(loaded);
      setSaved(JSON.stringify(loaded));
    });
  }, []);

  const reloadProviders = useCallback(async () => {
    await attempt(async () => setProviders(await api<ProviderSummary[]>("/api/admin/providers")));
  }, []);
  useEffect(() => void reloadProviders(), [reloadProviders]);

  const update = useCallback((fn: (draft: AppSettings) => void) => {
    setSettings((current) => {
      if (!current) return current;
      const draft = structuredClone(current);
      fn(draft);
      return draft;
    });
  }, []);

  const dirty = settings !== null && JSON.stringify(settings) !== saved;

  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    const result = await attempt(() => api<AppSettings>("/api/admin/settings", { method: "PUT", json: settings }), "تنظیمات ذخیره شد.");
    if (result) {
      setSettings(result);
      setSaved(JSON.stringify(result));
    }
    setSaving(false);
  }, [settings]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const state = useMemo<AdminState>(
    () => ({ settings, update, dirty, save, saving, providers, reloadProviders, mockEnabled }),
    [settings, update, dirty, save, saving, providers, reloadProviders, mockEnabled],
  );

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <AdminContext.Provider value={state}>
      <Toaster position="top-center" dir="rtl" theme="dark" richColors />
      <div className="flex min-h-dvh flex-col md:flex-row">
        <aside className="border-line md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:border-l">
          <div className="flex items-center justify-between gap-2 px-4 py-4">
            <div>
              <p className="font-bold">پنل مدیریت</p>
              <p className="text-xs text-muted" dir="ltr">
                {email}
              </p>
            </div>
            <a href="/" target="_blank" className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white" aria-label="مشاهدهٔ صفحهٔ آواتار">
              <ExternalLink className="size-4" />
            </a>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  history.replaceState(null, "", `#${id}`);
                }}
                className={cx(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                  tab === id ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={logout}
              className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/50 hover:bg-white/5 hover:text-white md:mt-4"
            >
              <LogOut className="size-4" />
              خروج
            </button>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto max-w-4xl space-y-5 pb-24">
            <h1 className="text-xl font-bold">{current.label}</h1>
            {settings ? current.render() : <p className="text-muted">در حال بارگذاری…</p>}
          </div>
        </main>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-warm">تغییرات ذخیره‌نشده دارید.</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSettings(JSON.parse(saved))}>
                بازگردانی
              </Button>
              <Button busy={saving} onClick={save}>
                ذخیرهٔ تنظیمات
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminContext.Provider>
  );
}

export function Section({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}
