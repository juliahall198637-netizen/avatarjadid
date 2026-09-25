// Fake D-ID Talks Streams API for local testing without credits.
// Run: node scripts/dev/fake-did.mjs, then open http://127.0.0.1:4600/peer.html in the
// same browser (it plays D-ID's WebRTC side). In the admin panel add a D-ID
// service with base URL http://127.0.0.1:4600 and API key test-did-key.
// GET /log shows every call it received.
import http from "node:http";
const log = [];
let waitingCreate = null, offer = null, answer = null, iceQueue = [], talkQueue = [], audioBytes = [];
const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
const PEER = `<!doctype html><script>
let pc, canvas = document.createElement("canvas"), talkingUntil = 0; canvas.width = 320; canvas.height = 400;
const ctx = canvas.getContext("2d");
function paint(){ if (window.gain) gain.gain.value = performance.now() < talkingUntil ? 0.2 : 0; if (performance.now() < talkingUntil) { ctx.fillStyle = "hsl(" + (performance.now()/5%360) + ",60%,50%)"; ctx.fillRect(0,0,320,400); } requestAnimationFrame(paint); } paint();
async function poll(){
  const r = await (await fetch("/peer/poll")).json();
  if (r.needOffer) {
    pc = new RTCPeerConnection();
    ctx.fillRect(0,0,320,400);
    const stream = canvas.captureStream();
    const ac = new AudioContext(); const dst = ac.createMediaStreamDestination(); const osc = ac.createOscillator(); window.gain = ac.createGain(); gain.gain.value = 0; osc.connect(gain); gain.connect(dst); osc.start();
    stream.getTracks().concat(dst.stream.getTracks()).forEach(t => pc.addTrack(t, stream));
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise(res => { if (pc.iceGatheringState === "complete") res(); pc.onicegatheringstatechange = () => pc.iceGatheringState === "complete" && res(); });
    await fetch("/peer/offer", { method: "POST", body: JSON.stringify(pc.localDescription) });
  }
  if (r.answer) await pc.setRemoteDescription(r.answer);
  for (const c of r.ice || []) { try { await pc.addIceCandidate(c); } catch (e) {} }
  for (const t of r.talks || []) talkingUntil = Math.max(performance.now(), talkingUntil) + t * 1000;
  document.title = pc ? pc.connectionState : "idle";
  setTimeout(poll, 150);
}
poll();
</script>`;
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const body = await readBody(req);
  if (url.pathname === "/peer.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(PEER); }
  if (url.pathname === "/peer/poll") { const r = { needOffer: !!waitingCreate && !offer, answer, ice: iceQueue, talks: talkQueue }; answer = null; iceQueue = []; talkQueue = []; return json(res, 200, r); }
  if (url.pathname === "/peer/offer") { offer = JSON.parse(body); const w = waitingCreate; waitingCreate = null;
    return json(res, 200, {}), w(); }
  if (url.pathname === "/log") return json(res, 200, { log, audioBytes });
  const auth = req.headers.authorization;
  log.push(`${req.method} ${url.pathname}${auth === "Basic test-did-key" ? "" : " BAD_AUTH:" + auth}`);
  if (auth !== "Basic test-did-key") return json(res, 401, { message: "bad auth" });
  if (url.pathname === "/credits") return json(res, 200, { remaining: 42, total: 100 });
  if (url.pathname === "/images") return json(res, 201, { id: "img_1", url: "s3://fake/img.png" });
  if (url.pathname === "/audios") {
    const text = body.toString("latin1");
    const ok = text.includes('name="audio"') && text.includes("RIFF") && text.includes("WAVEfmt ");
    audioBytes.push({ bytes: body.length, wav: ok });
    return json(res, 201, { id: "aud_" + audioBytes.length, url: `s3://fake/audio${audioBytes.length}.wav` });
  }
  if (req.method === "POST" && url.pathname === "/talks/streams") {
    const b = JSON.parse(body); log.push(`  source_url=${b.source_url}`);
    offer = null;
    await new Promise((r) => (waitingCreate = r));
    return json(res, 201, { id: "strm_test", session_id: "sess_1", offer, ice_servers: [] });
  }
  const b = body.length ? JSON.parse(body) : {};
  if (b.session_id !== "sess_1") log.push("  BAD_SESSION");
  if (url.pathname === "/talks/streams/strm_test/sdp") { answer = b.answer; return json(res, 200, { status: "success" }); }
  if (url.pathname === "/talks/streams/strm_test/ice") { if (b.candidate) iceQueue.push({ candidate: b.candidate, sdpMid: b.sdpMid, sdpMLineIndex: b.sdpMLineIndex }); return json(res, 200, { status: "success" }); }
  if (req.method === "POST" && url.pathname === "/talks/streams/strm_test") {
    const idx = Number(b.script?.audio_url?.match(/audio(\d+)/)?.[1] ?? 0);
    const seconds = audioBytes[idx - 1] ? (audioBytes[idx - 1].bytes - 300) / 48000 : 1;
    log.push(`  script=${b.script?.type}:${b.script?.audio_url} ~${seconds.toFixed(1)}s`);
    talkQueue.push(seconds);
    return json(res, 200, { status: "started", duration: seconds, video_id: "vid" });
  }
  if (req.method === "DELETE" && url.pathname === "/talks/streams/strm_test") return json(res, 200, { status: "deleted" });
  json(res, 404, { message: "unknown " + url.pathname });
}).listen(4600, () => console.log("fake D-ID on :4600"));
