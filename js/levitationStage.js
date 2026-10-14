import { STATES, GROUPS, INITIAL_STATE, neighbourhood } from "./stateMachine.js";
import { MediaLoader } from "./mediaLoader.js";

export class LevitationStage {
  #root;
  #media = new MediaLoader();
  #els = {};
  #current = null;
  #history = [];
  #busy = false;

  constructor(root) {
    this.#root = root;
    this.#build();
  }

  #build() {
    const root = this.#root;
    root.innerHTML = `
      <div class="stage">
        <div class="stage__frame">
          <div class="stage__glow" aria-hidden="true"></div>
          <div class="stage__media">
            <img class="stage__still" alt="" decoding="async" />
            <div class="stage__videos"></div>
            <div class="stage__spinner" hidden aria-hidden="true"><span></span></div>
          </div>
          <p class="stage__badge"><span class="stage__badge-dot"></span><span class="stage__badge-text"></span></p>
        </div>
      </div>

      <div class="panel">
        <div class="panel__head">
          <p class="panel__eyebrow">Current state</p>
          <h3 class="panel__title"></h3>
          <p class="panel__caption"></p>
        </div>

        <div class="panel__actions" role="group" aria-label="Available actions"></div>

        <div class="panel__foot">
          <button type="button" class="ghost-btn" data-act="back" disabled>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
            Back
          </button>
          <button type="button" class="ghost-btn" data-act="reset">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/></svg>
            Restart
          </button>
          <p class="panel__steps"><span class="panel__steps-count">0</span> steps</p>
        </div>
      </div>
    `;

    this.#els = {
      still: root.querySelector(".stage__still"),
      videos: root.querySelector(".stage__videos"),
      spinner: root.querySelector(".stage__spinner"),
      badgeText: root.querySelector(".stage__badge-text"),
      title: root.querySelector(".panel__title"),
      caption: root.querySelector(".panel__caption"),
      actions: root.querySelector(".panel__actions"),
      back: root.querySelector('[data-act="back"]'),
      reset: root.querySelector('[data-act="reset"]'),
      steps: root.querySelector(".panel__steps-count"),
    };

    this.#media.mount(this.#els.videos);

    this.#els.back.addEventListener("click", () => this.#goBack());
    this.#els.reset.addEventListener("click", () => this.reset());
  }

  async start() {
    await this.#enter(INITIAL_STATE, { record: false });

    const net = navigator.connection;
    const thrifty =
      net?.saveData === true || /(^|-)2g$/.test(net?.effectiveType ?? "");
    if (thrifty) return;

    const { allClips, allStills } = await import("./stateMachine.js");
    this.#media.warmLazily([...allClips(), ...allStills()]);
  }

  reset() {
    if (this.#busy) return;
    this.#history = [];
    this.#enter(INITIAL_STATE, { record: false });
  }

  async #enter(stateId, { record = true } = {}) {
    const state = STATES[stateId];
    if (!state) return;

    if (record && this.#current) this.#history.push(this.#current);
    this.#current = stateId;

    await this.#media.image(state.image);
    this.#els.still.src = state.image;
    this.#els.still.alt = `${state.name} — ${state.caption}`;

    this.#els.title.textContent = state.name;
    this.#els.caption.textContent = state.caption;
    this.#els.badgeText.textContent = state.name;
    this.#els.steps.textContent = String(this.#history.length);
    this.#els.back.disabled = this.#history.length === 0;

    this.#renderActions(state);

    const hood = neighbourhood(stateId);
    this.#media.warm(hood).then(() => this.#refreshActionReadiness());
    this.#refreshActionReadiness();
  }

  #renderActions(state) {
    const actions = this.#els.actions;
    actions.innerHTML = "";

    const ordered = [...state.transitions];
    const groupsSeen = [];
    for (const t of ordered) {
      const key = t.group ?? "_";
      if (!groupsSeen.includes(key)) groupsSeen.push(key);
    }

    for (const key of groupsSeen) {
      const items = ordered.filter((t) => (t.group ?? "_") === key);
      const wrap = document.createElement("div");
      wrap.className = "action-group";

      if (key !== "_" && GROUPS[key]) {
        const head = document.createElement("div");
        head.className = "action-group__head";
        head.innerHTML = `
          <span class="action-group__label">${GROUPS[key].label}</span>
          <span class="action-group__hint">${GROUPS[key].hint}</span>
        `;
        wrap.append(head);
      }

      const list = document.createElement("div");
      list.className = "action-group__list";
      for (const t of items) list.append(this.#actionButton(t));
      wrap.append(list);
      actions.append(wrap);
    }
  }

  #actionButton(transition) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-btn";
    btn.dataset.clips = transition.clips.join("|");
    btn.innerHTML = `
      <span class="action-btn__label">${transition.label}</span>
      <span class="action-btn__to">${STATES[transition.to]?.name ?? transition.to}</span>
      <span class="action-btn__spark" aria-hidden="true"></span>
    `;
    btn.addEventListener("click", () => this.#play(transition, btn));
    return btn;
  }

  #refreshActionReadiness() {
    for (const btn of this.#els.actions.querySelectorAll(".action-btn")) {
      const clips = btn.dataset.clips.split("|");
      const ready = clips.every((c) => this.#media.isVideoReady(c));
      btn.classList.toggle("is-buffering", !ready);
    }
  }

  async #play(transition, btn) {
    if (this.#busy) return;
    this.#busy = true;
    this.#root.classList.add("is-playing");
    btn.classList.add("is-active");
    this.#setActionsDisabled(true);

    try {

      for (const clip of transition.clips) {
        await this.#playClip(clip);
      }

      await this.#enter(transition.to);
      this.#clearVideoLayer();
    } catch (err) {

      console.warn("[levitation] transition fell back to an instant jump:", err);
      await this.#enter(transition.to);
      this.#clearVideoLayer();
    } finally {
      btn.classList.remove("is-active");
      this.#setActionsDisabled(false);
      this.#root.classList.remove("is-playing");
      this.#busy = false;
    }
  }

  static #STALL_TIMEOUT_MS = 8000;

  #playClip(src) {
    const entry = this.#media.video(src);
    const el = entry.el;

    if (el.readyState < 3) this.#els.spinner.hidden = false;

    return entry.ready
      .then(() => {
        el.playbackRate = 1;

        const atStart =
          el.currentTime === 0
            ? Promise.resolve()
            : new Promise((resolve) => {
                el.addEventListener("seeked", resolve, { once: true });
                el.currentTime = 0;
              });

        return atStart.then(() => {
          this.#showOnly(el);

          return new Promise((resolve, reject) => {
            let lastTime = -1;
            let stalledFor = 0;
            const TICK = 250;

            const cleanup = () => {
              clearInterval(watchdog);
              el.removeEventListener("ended", onEnded);
              el.removeEventListener("error", onError);
              el.removeEventListener("waiting", onWaiting);
              el.removeEventListener("playing", onPlaying);
            };
            const onEnded = () => {
              cleanup();
              this.#els.spinner.hidden = true;
              resolve();
            };
            const onError = () => {
              cleanup();
              this.#els.spinner.hidden = true;
              reject(new Error(`playback failed: ${src}`));
            };
            const onWaiting = () => {
              this.#els.spinner.hidden = false;
            };
            const onPlaying = () => {
              this.#els.spinner.hidden = true;
            };

            const watchdog = setInterval(() => {
              if (el.ended) return onEnded();
              if (el.currentTime === lastTime) {
                stalledFor += TICK;
                if (stalledFor >= LevitationStage.#STALL_TIMEOUT_MS) {
                  el.pause();
                  onError();
                }
              } else {
                lastTime = el.currentTime;
                stalledFor = 0;
              }
            }, TICK);

            el.addEventListener("ended", onEnded);
            el.addEventListener("error", onError);
            el.addEventListener("waiting", onWaiting);
            el.addEventListener("playing", onPlaying);

            const started = el.play();
            if (started?.catch) started.catch(onError);
          });
        });
      })
      .finally(() => {
        this.#els.spinner.hidden = true;
      });
  }

  #showOnly(el) {
    for (const other of this.#els.videos.children) {
      other.classList.toggle("is-visible", other === el);
    }
  }

  #clearVideoLayer() {
    for (const el of this.#els.videos.children) el.classList.remove("is-visible");
  }

  #setActionsDisabled(disabled) {
    for (const btn of this.#els.actions.querySelectorAll(".action-btn")) {
      btn.disabled = disabled;
    }
    this.#els.back.disabled = disabled || this.#history.length === 0;
    this.#els.reset.disabled = disabled;
  }

  #goBack() {
    if (this.#busy || !this.#history.length) return;
    const previous = this.#history.pop();
    this.#enter(previous, { record: false });
  }
}
