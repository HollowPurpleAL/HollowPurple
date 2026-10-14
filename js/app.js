import { LevitationStage } from "./levitationStage.js";
import { getDocument, GlobalWorkerOptions } from "./vendor/pdf.min.mjs";

function initStage() {
  const root = document.getElementById("levitation-stage");
  if (!root) return;
  const stage = new LevitationStage(root);
  stage.start();
}

function initNav() {
  const header = document.getElementById("site-header");
  const nav = document.getElementById("primary-nav");
  const toggle = document.querySelector(".nav-toggle");
  if (!header || !nav || !toggle) return;

  const links = [...nav.querySelectorAll("a")];

  const close = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  };

  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });

  links.forEach((a) => a.addEventListener("click", close));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  matchMedia("(min-width: 980px)").addEventListener("change", close);

  const onScroll = () => {
    header.classList.toggle("is-stuck", window.scrollY > 8);
    const bar = document.getElementById("scroll-progress");
    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;
    }
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const sections = links
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  if (sections.length && "IntersectionObserver" in window) {
    const visible = new Set();
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const active = sections.find((s) => visible.has(s.id))?.id;
        links.forEach((a) =>
          a.classList.toggle("is-active", Boolean(active) && a.getAttribute("href") === `#${active}`)
        );
      },
      { rootMargin: "-25% 0px -60% 0px", threshold: 0 }
    );
    sections.forEach((s) => spy.observe(s));
  }
}

function initReveal() {
  const targets = document.querySelectorAll(
    ".section__head, .highlight, .si-card, .poster-layout, .pub-entry, .reading-box, .about-layout, .stage-layout"
  );
  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-in"));
    return;
  }

  targets.forEach((el, i) => {
    el.classList.add("reveal");
    el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  targets.forEach((el) => io.observe(el));
}

function initHeroVideo() {
  const video = document.querySelector(".hero__video");
  if (!video) return;

  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute("muted", "");
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");

  const start = () => {
    const pending = video.play();
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  };

  const restart = () => {
    video.currentTime = 0;
    start();
  };

  video.addEventListener("ended", restart);
  video.addEventListener("pause", () => {
    if (video.ended) restart();
  });

  if (video.readyState >= 2) start();
  else video.addEventListener("canplay", start, { once: true });
  video.addEventListener("loadeddata", start);
}

const POSTER_PREVIEW = "assets/poster/poster-preview.pdf";

async function initPosterPreview() {
  const figure = document.getElementById("poster-preview");
  const canvas = figure?.querySelector("canvas");
  if (!figure || !canvas) return;
  const src = figure.dataset.pdf || POSTER_PREVIEW;

  const showFrame = () => {
    const frame = document.createElement("iframe");
    frame.className = "poster-preview__frame";
    frame.title = "Preview of the full conference poster";
    frame.src = `${src}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`;
    figure.replaceChildren(frame);
  };

  try {
    GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;
    const response = await fetch(src, { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    const data = new Uint8Array(await response.arrayBuffer());
    const pdf = await getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1100 / unscaled.width });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  } catch {
    showFrame();
  }
}

function boot() {
  initNav();
  initHeroVideo();
  initStage();
  initReveal();
  initPosterPreview();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
