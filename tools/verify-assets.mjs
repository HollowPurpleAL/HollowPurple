import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const ffprobePath = ffprobeStatic.path;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = resolve(ROOT, "_verify");
mkdirSync(TMP, { recursive: true });

const run = (bin, args) =>
  execFileSync(bin, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();

function frameCount(file) {
  return Number(
    JSON.parse(
      run(ffprobePath, [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=nb_frames", "-of", "json", file,
      ])
    ).streams[0].nb_frames
  );
}

function grab(clip, edge, tag) {
  const input = resolve(ROOT, `${clip}.mp4`);
  const out = resolve(TMP, `${tag}.png`);
  const index = edge === "first" ? 0 : frameCount(input) - 1;
  run(ffmpegPath, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", input,
    "-vf", `select=eq(n\\,${index}),scale=1080:1920:flags=lanczos`,
    "-frames:v", "1", "-fps_mode", "passthrough", out,
  ]);
  return out;
}

function ssim(a, b) {
  const stderr = execFileSync(
    ffmpegPath,
    [
      "-hide_banner", "-y",
      "-i", a, "-i", b,
      "-lavfi",
      "[0:v]scale=1080:1920,format=gray[x];[1:v]scale=1080:1920,format=gray[y];[x][y]ssim",
      "-f", "null", "-",
    ],
    { stdio: ["ignore", "pipe", "pipe"] , encoding: "utf8"}
  );
  const all = execFileSync(
    ffmpegPath,
    [
      "-hide_banner", "-y",
      "-i", a, "-i", b,
      "-lavfi",
      "[0:v]scale=1080:1920,format=gray[x];[1:v]scale=1080:1920,format=gray[y];[x][y]ssim=stats_file=-",
      "-f", "null", "-",
    ],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }
  );
  const m = /All:([0-9.]+)/.exec(all + stderr);
  return m ? Number(m[1]) : NaN;
}

const verdict = (v) => (v >= 0.99 ? "MATCH " : v >= 0.9 ? "close " : "DIFFER");
const line = (label, v) =>
  console.log(`  ${verdict(v)} ${String(v.toFixed(4)).padStart(6)}  ${label}`);

const state = (id) => resolve(ROOT, "assets/states", `${id}.png`);

console.log("--- clip final frame vs. the state it lands on ---");
const landings = [
  ["Poweron", "idle"],
  ["tilt", "idle"],
  ["oscillate", "idle"],
  ["Dropmix", "idle"],
  ["drop", "idle"],
  ["Createamp", "amp"],
  ["Ampdec", "amp"],
  ["Injectfield", "field"],
  ["Ampinc", "amp-high"],
  ["Injectsolv", "solvent"],
  ["addsts", "solvent-added"],
  ["addwts", "two-phase"],
  ["merge", "merged"],
  ["react", "extracted"],
  ["sep", "separated"],
  ["collect", "one-phase"],
];
for (const [clip, id] of landings) {
  line(`${clip}.mp4 [last] -> ${id}`, ssim(grab(clip, "last", `${clip}-last`), state(id)));
}

console.log("\n--- clip first frame vs. the state it departs from ---");
const departures = [
  ["Poweron", "off"],
  ["Createamp", "idle"],
  ["tilt", "idle"],
  ["oscillate", "idle"],
  ["Injectfield", "amp"],
  ["Ampinc", "field"],
  ["Ampdec", "amp-high"],
  ["Injectsolv", "idle"],
  ["addsts", "solvent"],
  ["addwts", "solvent"],
  ["merge", "two-phase"],
  ["react", "merged"],
  ["sep", "extracted"],
  ["collect", "separated"],
  ["drop", "one-phase"],
  ["mixmix", "solvent-added"],
];
for (const [clip, id] of departures) {
  line(`${clip}.mp4 [first] <- ${id}`, ssim(grab(clip, "first", `${clip}-first`), state(id)));
}

console.log("\n--- chained clips (mixmix -> Dropmix) ---");
line(
  "mixmix.mp4 [last] -> Dropmix.mp4 [first]",
  ssim(grab("mixmix", "last", "mixmix-last"), grab("Dropmix", "first", "Dropmix-first"))
);

console.log("\n--- derived stills vs. hand-exported PNGs named in the flowchart ---");
const exported = [
  ["amp.png", "amp"],
  ["Field.png", "field"],
  ["Ampinc.png", "amp-high"],
  ["solv.png", "solvent"],
  ["Sts.png", "solvent-added"],
  ["2Phase.png", "two-phase"],
  ["Merged.png", "merged"],
  ["extract.png", "extracted"],
  ["sep.png", "separated"],
  ["1Phase.png", "one-phase"],
  ["../Off.png", "off"],
  ["../Idle.png", "idle"],
];
for (const [file, id] of exported) {
  const p = resolve(ROOT, file);
  if (!existsSync(p)) {
    console.log(`  MISSING       ${file}`);
    continue;
  }
  line(`${file} vs ${id}`, ssim(p, state(id)));
}
