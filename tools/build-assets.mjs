import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const ffprobePath = ffprobeStatic.path;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = ROOT;
const OUT_VIDEO = resolve(ROOT, "assets/video");
const OUT_STATE = resolve(ROOT, "assets/states");

const WIDTH = 1080;
const HEIGHT = 1920;

const CLIPS = [
  "Poweron",
  "Createamp",
  "Ampinc",
  "Ampdec",
  "tilt",
  "oscillate",
  "Injectfield",
  "Injectsolv",
  "addsts",
  "mixmix",
  "Dropmix",
  "addwts",
  "merge",
  "react",
  "sep",
  "collect",
  "drop",
];

const HERO = { clip: "streaming", width: 720, height: 1280, crf: 25 };

const STATE_FRAMES = {
  off: { clip: "Poweron", edge: "first" },
  idle: { clip: "Poweron", edge: "last" },
  amp: { clip: "Createamp", edge: "last" },
  field: { clip: "Injectfield", edge: "last" },
  "amp-high": { clip: "Ampinc", edge: "last" },
  solvent: { clip: "Injectsolv", edge: "last" },
  "solvent-added": { clip: "addsts", edge: "last" },
  "two-phase": { clip: "addwts", edge: "last" },
  merged: { clip: "merge", edge: "last" },
  extracted: { clip: "react", edge: "last" },
  separated: { clip: "sep", edge: "last" },
  "one-phase": { clip: "collect", edge: "last" },
};

const run = (bin, args) =>
  execFileSync(bin, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();

function probe(file) {
  const json = JSON.parse(
    run(ffprobePath, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,nb_frames,r_frame_rate,codec_name",
      "-of", "json",
      file,
    ])
  );
  return json.streams[0];
}

function kb(file) {
  return Math.round(statSync(file).size / 1024);
}

function transcode(name, { width = WIDTH, height = HEIGHT, crf = 21, out } = {}) {
  const input = resolve(SRC, `${name}.mp4`);
  const output = resolve(OUT_VIDEO, out ?? `${name.toLowerCase()}.mp4`);
  run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", input,

    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "-c:v", "libx264",
    "-profile:v", "high",
    "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-crf", String(crf),
    "-preset", "slow",

    "-g", "48",
    "-an",
    "-movflags", "+faststart",
    output,
  ]);
  return output;
}

function extractFrame(clip, edge, outFile) {
  const input = resolve(SRC, `${clip}.mp4`);
  const total = Number(probe(input).nb_frames);
  const index = edge === "first" ? 0 : total - 1;
  run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", input,
    "-vf", `select=eq(n\\,${index}),scale=${WIDTH}:${HEIGHT}:flags=lanczos`,
    "-frames:v", "1",
    "-fps_mode", "passthrough",
    outFile,
  ]);
  return outFile;
}

mkdirSync(OUT_VIDEO, { recursive: true });
mkdirSync(OUT_STATE, { recursive: true });

console.log("--- transcoding HEVC -> H.264 ---");
let srcTotal = 0;
let outTotal = 0;
for (const name of CLIPS) {
  const input = resolve(SRC, `${name}.mp4`);
  if (!existsSync(input)) {
    console.log(`  SKIP  ${name}.mp4 (missing)`);
    continue;
  }
  const output = transcode(name);
  srcTotal += kb(input);
  outTotal += kb(output);
  console.log(
    `  ${name.padEnd(14)} ${String(kb(input)).padStart(5)} KB -> ${String(kb(output)).padStart(5)} KB`
  );
}
console.log(`  TOTAL          ${srcTotal} KB -> ${outTotal} KB`);

console.log("\n--- hero loop ---");
if (existsSync(resolve(SRC, `${HERO.clip}.mp4`))) {
  const hero = transcode(HERO.clip, { ...HERO, out: "hero-loop.mp4" });
  console.log(`  hero-loop.mp4  ${HERO.width}x${HERO.height}  ${kb(hero)} KB`);
  const poster = resolve(ROOT, "assets/meta/hero-poster.png");
  mkdirSync(dirname(poster), { recursive: true });
  run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", hero,
    "-vf", "select=eq(n\\,0)",
    "-frames:v", "1",
    poster,
  ]);
  console.log(`  hero-poster.png                ${kb(poster)} KB`);
} else {
  console.log(`  SKIP  ${HERO.clip}.mp4 (missing)`);
}

console.log("\n--- extracting state stills from clip frames ---");
for (const [id, { clip, edge }] of Object.entries(STATE_FRAMES)) {
  const out = resolve(OUT_STATE, `${id}.png`);
  extractFrame(clip, edge, out);
  console.log(`  ${id.padEnd(14)} <- ${clip}.mp4 [${edge} frame]  ${kb(out)} KB`);
}

console.log("\nDone.");
