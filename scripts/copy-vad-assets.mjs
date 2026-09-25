// Copies the voice-activity-detection model and ONNX runtime files into
// public/vad so they are served from our own domain (CDNs can be blocked).
import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const out = path.join(process.cwd(), "public", "vad");
await mkdir(out, { recursive: true });

const sources = [
  ["node_modules/@ricky0123/vad-web/dist", (f) => f === "vad.worklet.bundle.min.js" || f.endsWith(".onnx")],
  ["node_modules/onnxruntime-web/dist", (f) => /^ort-wasm-simd-threaded(\.jsep)?\.(wasm|mjs)$/.test(f)],
];

let copied = 0;
for (const [dir, keep] of sources) {
  let files;
  try {
    files = await readdir(dir);
  } catch {
    console.warn(`[vad] ${dir} not found; skipping`);
    continue;
  }
  for (const file of files.filter(keep)) {
    await copyFile(path.join(dir, file), path.join(out, file));
    copied++;
  }
}
console.log(`[vad] copied ${copied} files to public/vad`);
