const READY_ENOUGH = 3;

export class MediaLoader {
  #videos = new Map();
  #images = new Map();
  #mount = null;

  mount(container) {
    this.#mount = container;
    for (const { el } of this.#videos.values()) {
      if (el.parentNode !== container) container.append(el);
    }
  }

  video(src) {
    let entry = this.#videos.get(src);
    if (entry) return entry;

    const el = document.createElement("video");
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute("muted", "");
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.preload = "auto";
    el.disablePictureInPicture = true;
    el.disableRemotePlayback = true;
    el.controls = false;
    el.className = "stage__video";
    el.src = src;

    entry = { el, ready: null };
    entry.ready = new Promise((resolve) => {
      if (el.readyState >= READY_ENOUGH) return resolve(el);
      const done = () => {
        el.removeEventListener("canplaythrough", done);
        el.removeEventListener("loadeddata", check);
        el.removeEventListener("error", fail);
        resolve(el);
      };
      const check = () => {
        if (el.readyState >= READY_ENOUGH) done();
      };

      const fail = () => done();
      el.addEventListener("canplaythrough", done, { once: true });
      el.addEventListener("loadeddata", check);
      el.addEventListener("error", fail, { once: true });
    });

    if (this.#mount) this.#mount.append(el);
    el.load();
    this.#videos.set(src, entry);
    return entry;
  }

  isVideoReady(src) {
    const entry = this.#videos.get(src);
    return Boolean(entry && entry.el.readyState >= READY_ENOUGH);
  }

  image(src) {
    let promise = this.#images.get(src);
    if (promise) return promise;

    promise = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      const settle = () =>
        typeof img.decode === "function"
          ? img.decode().then(() => resolve(img), () => resolve(img))
          : resolve(img);
      if (img.complete) settle();
      else {
        img.addEventListener("load", settle, { once: true });
        img.addEventListener("error", () => resolve(img), { once: true });
      }
    });

    this.#images.set(src, promise);
    return promise;
  }

  warm({ clips = [], stills = [] } = {}) {
    return Promise.all([
      ...clips.map((src) => this.video(src).ready),
      ...stills.map((src) => this.image(src)),
    ]);
  }

  warmLazily(sources) {
    const queue = [...sources];
    const pump = () => {
      const next = queue.shift();
      if (!next) return;
      const done = () => schedule();
      if (next.endsWith(".mp4")) this.video(next).ready.then(done, done);
      else this.image(next).then(done, done);
    };
    const schedule = () => {
      if (!queue.length) return;
      if ("requestIdleCallback" in window) requestIdleCallback(pump, { timeout: 2000 });
      else setTimeout(pump, 200);
    };
    schedule();
  }
}
