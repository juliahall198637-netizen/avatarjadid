// End-to-end smoke test against a running server with ENABLE_MOCK_PROVIDERS=1.
// Usage: BASE_URL=http://localhost:3000 ADMIN_EMAIL=.. ADMIN_PASSWORD=.. npm run test:e2e
// It creates a mock provider, points every capability at it, then runs a
// spoken turn (WAV upload) and a typed turn and checks the streamed events.

const base = process.env.BASE_URL ?? "http://localhost:3000";
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");

let adminCookie = "";
let visitorCookie = "";
let failures = 0;

function check(label, condition, detail = "") {
  console.log(`${condition ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

async function call(path, { method = "GET", json, form, cookie = adminCookie, raw = false } = {}) {
  const headers = { Origin: base, Cookie: cookie };
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) body = form;
  const response = await fetch(base + path, { method, headers, body });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (raw) return { response, setCookie };
  const data = await response.json().catch(() => null);
  return { status: response.status, data, setCookie };
}

function wavTone(seconds = 1.2, rate = 16000) {
  const samples = Math.floor(seconds * rate);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 8000), 44 + i * 2);
  return buffer;
}

async function turn(conversationId, fields) {
  const form = new FormData();
  form.append("conversationId", conversationId);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const { response } = await call("/api/turn", { method: "POST", form, cookie: visitorCookie, raw: true });
  const text = await response.text();
  return { status: response.status, events: text.split("\n").filter(Boolean).map((l) => JSON.parse(l)) };
}

// ── Admin ──────────────────────────────────────────────────────────────────
{
  const unauth = await call("/api/admin/settings", { cookie: "" });
  check("admin API rejects anonymous callers", unauth.status === 401);

  const bad = await call("/api/admin/login", { method: "POST", json: { email, password: "wrong-password" }, cookie: "" });
  check("wrong password is rejected", bad.status === 401);

  const login = await call("/api/admin/login", { method: "POST", json: { email, password }, cookie: "" });
  adminCookie = login.setCookie.map((c) => c.split(";")[0]).join("; ");
  check("admin login", login.status === 200 && adminCookie.includes("aj_admin"));

  const crossSite = await fetch(base + "/api/admin/settings", {
    method: "PUT",
    headers: { Origin: "https://evil.example", Cookie: adminCookie, "Content-Type": "application/json" },
    body: "{}",
  });
  check("cross-origin admin write is refused", crossSite.status === 403);
}

const provider = await call("/api/admin/providers", {
  method: "POST",
  json: { kind: "mock", name: "Mock e2e", apiKey: "sk-test-1234567890abcdef", config: {}, useProxy: false, enabled: true },
});
check("create mock provider", provider.status === 200, provider.data?.message);
const providerId = provider.data?.id;

const listed = await call("/api/admin/providers");
const mine = listed.data?.find((p) => p.id === providerId);
check("stored key is masked, never returned", mine && mine.apiKeyMasked && !JSON.stringify(listed.data).includes("1234567890abcdef"));

const tested = await call(`/api/admin/providers/${providerId}/test`, { method: "POST" });
check("provider connection test", tested.data?.ok === true, tested.data?.message);

const current = (await call("/api/admin/settings")).data;
const settings = {
  ...current,
  llm: { primary: { providerId, model: "mock", temperature: null, maxTokens: null, effort: null }, fallback: null },
  stt: { primary: { providerId, model: "", language: "fa", hint: "" }, fallback: null },
  tts: { primary: { providerId, model: "", voice: "", speed: 1, instructions: "" }, fallback: null },
  embeddings: { providerId, model: "mock" },
  persona: { ...current.persona, knowledgeMode: "prefer" },
};
const saved = await call("/api/admin/settings", { method: "PUT", json: settings });
check("save settings", saved.status === 200, saved.data?.message);

const doc = new FormData();
doc.append("title", "ساعات کاری");
doc.append("text", "ساعات کاری دفتر ما از شنبه تا چهارشنبه، ساعت هشت صبح تا چهار بعدازظهر است. پنجشنبه‌ها تعطیل هستیم.");
const added = await call("/api/admin/knowledge", { method: "POST", form: doc });
check("add knowledge document", added.status === 200, added.data?.message ?? added.data?.warning);

const preview = await call("/api/admin/tts-preview", { method: "POST", json: { text: "سلام، آزمون صدا." } });
check("TTS preview returns audio", preview.data?.ok && preview.data.pcm?.length > 1000, preview.data?.message);

// ── Visitor ────────────────────────────────────────────────────────────────
{
  const home = await fetch(base + "/");
  const html = await home.text();
  check("home page renders", home.status === 200 && html.includes("dir=\"rtl\""));
  check("home page leaks no provider id", !html.includes(providerId));

  const conversation = await call("/api/conversation", { method: "POST", cookie: "" });
  visitorCookie = conversation.setCookie.map((c) => c.split(";")[0]).join("; ");
  check("start conversation", conversation.status === 200 && conversation.data?.id);
  const conversationId = conversation.data.id;

  const greet = await call("/api/greet", { method: "POST", cookie: visitorCookie });
  check("greeting audio", greet.data?.pcm?.length > 1000);

  const spoken = await turn(conversationId, { audio: new Blob([wavTone()], { type: "audio/wav" }) });
  const types = spoken.events.map((e) => e.t);
  check("spoken turn streams user → delta → audio → done", ["user", "delta", "audio", "done"].every((t) => types.includes(t)), types.join(","));
  check("answer used the knowledge base", spoken.events.find((e) => e.t === "done")?.source === "knowledge");
  const audioEvents = spoken.events.filter((e) => e.t === "audio");
  check("audio arrives in sentence order", audioEvents.every((e, i) => e.seq === i), `${audioEvents.length} clips`);

  const typed = await turn(conversationId, { text: "آدرس شما کجاست؟" });
  check("typed turn works", typed.events.some((e) => e.t === "done"), typed.events.map((e) => e.t).join(","));

  const stranger = await call("/api/conversation", { method: "POST", cookie: "" });
  const strangerCookie = stranger.setCookie.map((c) => c.split(";")[0]).join("; ");
  const form = new FormData();
  form.append("conversationId", conversationId);
  form.append("text", "hi");
  const hijack = await fetch(base + "/api/turn", { method: "POST", headers: { Cookie: strangerCookie, Origin: base }, body: form });
  check("another visitor cannot use this conversation", hijack.status === 404);

  const noCookie = await call("/api/avatar-session", { method: "POST", cookie: "" });
  check("avatar session requires an existing visitor (no forked identity)", noCookie.status === 409);

  const history = await call(`/api/admin/conversations/${conversationId}`);
  check("conversation is archived for the admin", history.data?.length === 4, `${history.data?.length} messages`);
}

// ── Features ported from the earlier projects ──────────────────────────────
{
  const conversation = await call("/api/conversation", { method: "POST", cookie: "" });
  visitorCookie = conversation.setCookie.map((c) => c.split(";")[0]).join("; ");
  const conversationId = conversation.data.id;
  const current = (await call("/api/admin/settings")).data;

  // Content policy: a blocked keyword is refused without calling the model.
  await call("/api/admin/settings", { method: "PUT", json: { ...current, policy: { ...current.policy, blockedKeywords: "قیمت دلار" } } });
  const refused = await turn(conversationId, { text: "قیمت دلار امروز چنده؟" });
  const done = refused.events.find((e) => e.t === "done");
  check("blocked keyword is refused with the refusal text", done?.source === "policy" && done.text === current.policy.refusalText);
  await call("/api/admin/settings", { method: "PUT", json: current });

  // A disabled document is no longer used for answers.
  const docs = (await call("/api/admin/knowledge")).data.filter((d) => d.title === "ساعات کاری");
  for (const doc of docs) await call(`/api/admin/knowledge/${doc.id}`, { method: "PATCH", json: { active: false } });
  const withoutDoc = await turn(conversationId, { text: "ساعات کاری دفتر چیست؟" });
  check("disabled document is not used", withoutDoc.events.find((e) => e.t === "done")?.source === "general");
  for (const doc of docs) await call(`/api/admin/knowledge/${doc.id}`, { method: "PATCH", json: { active: true } });
  const withDoc = await turn(conversationId, { text: "ساعات کاری دفتر چیست؟" });
  const doneWithDoc = withDoc.events.find((e) => e.t === "done");
  check("re-enabled document is used and named as source", doneWithDoc?.source === "knowledge" && doneWithDoc.sources?.includes("ساعات کاری"));

  // Operator role: content yes, keys and settings no.
  const operatorEmail = `operator-${Date.now()}@example.com`;
  await call("/api/admin/admins", { method: "POST", json: { email: operatorEmail, password: "operator-password-1", role: "operator" } });
  const opLogin = await call("/api/admin/login", { method: "POST", json: { email: operatorEmail, password: "operator-password-1" }, cookie: "" });
  const opCookie = opLogin.setCookie.map((c) => c.split(";")[0]).join("; ");
  check("operator can read knowledge", (await call("/api/admin/knowledge", { cookie: opCookie })).status === 200);
  check("operator cannot read provider keys", (await call("/api/admin/providers", { cookie: opCookie })).status === 403);
  check("operator cannot change settings", (await call("/api/admin/settings", { method: "PUT", json: current, cookie: opCookie })).status === 403);

  // Audit log, settings history, export.
  const auditRows = (await call("/api/admin/audit")).data ?? [];
  check("audit log records admin actions", ["ورود", "ذخیرهٔ تنظیمات", "افزودن اپراتور"].every((a) => auditRows.some((r) => r.action === a)));
  const history = (await call("/api/admin/settings/history")).data ?? [];
  const restore = await call("/api/admin/settings/history", { method: "POST", json: { id: history[1]?.id } });
  check("settings history can be restored", history.length > 1 && restore.status === 200);
  const csv = await fetch(base + "/api/admin/conversations/export", { headers: { Cookie: adminCookie } });
  const csvText = await csv.text();
  check("conversation CSV export", csv.status === 200 && csvText.includes("ساعات کاری دفتر چیست"));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
