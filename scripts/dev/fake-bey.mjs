// Fake Beyond Presence API for local testing with a real LiveKit server.
// Run: node scripts/dev/fake-bey.mjs, then open http://127.0.0.1:4700/avatar.html
// (it joins the LiveKit room as the avatar, like Beyond Presence's worker).
// Local LiveKit: docker run --network host livekit/livekit-server --dev --bind 127.0.0.1
//   → add a LiveKit service with ws://127.0.0.1:7880, key "devkey", secret "secret".
// Add a Beyond Presence service with base URL http://127.0.0.1:4700, key "test-bey-key".
// GET /log shows what it received.
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const log = [];
let pending = null;
const umd = readFileSync(path.join(process.cwd(), "node_modules/livekit-client/dist/livekit-client.umd.js"));
const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c).toString())); });

const AVATAR = `<!doctype html><script src="/livekit-client.umd.js"></script><script>
const { Room, LocalVideoTrack, LocalAudioTrack, Track } = LivekitClient;
const canvas = Object.assign(document.createElement("canvas"), { width: 320, height: 400 });
const ctx = canvas.getContext("2d");
let talkingUntil = 0, gain;
(function paint() { const t = performance.now() < talkingUntil; if (gain) gain.gain.value = t ? 0.2 : 0;
  ctx.fillStyle = t ? "hsl(" + (performance.now() / 5 % 360) + ",60%,50%)" : "#223"; ctx.fillRect(0, 0, 320, 400); requestAnimationFrame(paint); })();
async function report(line) { await fetch("/avatar/log", { method: "POST", body: line }); }
async function poll() {
  const s = await (await fetch("/avatar/poll")).json();
  if (!s.session) return setTimeout(poll, 200);
  const room = new Room();
  room.registerByteStreamHandler("lk.audio_stream", async (reader, from) => {
    let bytes = 0; for await (const chunk of reader) bytes += chunk.byteLength;
    const a = reader.info.attributes || {};
    const secs = bytes / 2 / Number(a.sample_rate || 24000) / Number(a.num_channels || 1);
    await report("audio stream from " + from.identity + ": " + bytes + " bytes, sample_rate=" + a.sample_rate + ", channels=" + a.num_channels + " (" + secs.toFixed(1) + "s)");
    talkingUntil = Math.max(performance.now(), talkingUntil) + secs * 1000;
    setTimeout(() => room.localParticipant.performRpc({ destinationIdentity: from.identity, method: "lk.playback_finished", payload: JSON.stringify({ playback_position: secs, interrupted: false }) })
      .then((r) => report("playback_finished rpc answered: " + r)).catch((e) => report("rpc error " + e.message)), secs * 1000);
  });
  room.registerRpcMethod("lk.clear_buffer", async () => { talkingUntil = 0; await report("clear_buffer received"); return "ok"; });
  await room.connect(s.session.url, s.session.token);
  await report("avatar joined room " + room.name + " as " + room.localParticipant.identity + " (publish_on_behalf=" + room.localParticipant.attributes["lk.publish_on_behalf"] + ")");
  const ac = new AudioContext(); const dst = ac.createMediaStreamDestination(); const osc = ac.createOscillator(); gain = ac.createGain(); osc.connect(gain); gain.connect(dst); osc.start();
  await room.localParticipant.publishTrack(new LocalVideoTrack(canvas.captureStream(15).getVideoTracks()[0]));
  await room.localParticipant.publishTrack(new LocalAudioTrack(dst.stream.getAudioTracks()[0]));
  await report("avatar published video + audio");
}
poll();
</script>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const body = await readBody(req);
  if (url.pathname === "/avatar.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(AVATAR); }
  if (url.pathname === "/livekit-client.umd.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(umd); }
  if (url.pathname === "/avatar/poll") { const s = pending; pending = null; return json(res, 200, { session: s }); }
  if (url.pathname === "/avatar/log") { log.push("  [avatar] " + body); return json(res, 200, {}); }
  if (url.pathname === "/log") return json(res, 200, { log });
  const key = req.headers["x-api-key"];
  log.push(`${req.method} ${url.pathname}${key === "test-bey-key" ? "" : " BAD_KEY"}`);
  if (key !== "test-bey-key") return json(res, 401, { detail: "bad key" });
  if (url.pathname === "/v1/auth/verify") return json(res, 200, { ok: true });
  if (req.method === "POST" && url.pathname === "/v1/sessions") {
    const b = JSON.parse(body);
    log.push(`  transport=${b.transport} avatar_id=${b.avatar_id} url=${b.url} token=${b.token ? "yes" : "no"}`);
    pending = { url: b.url, token: b.token };
    return json(res, 201, { id: "sess_fake" });
  }
  json(res, 404, { detail: "not found" });
}).listen(4700, () => console.log("fake Beyond Presence on :4700"));
