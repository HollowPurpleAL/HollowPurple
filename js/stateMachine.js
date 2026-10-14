const VIDEO = "assets/video/";
const STILL = "assets/states/";

export const GROUPS = {
  characteristics: {
    label: "Characteristics",
    hint: "Probe how the acoustic trap behaves",
  },
  manipulation: {
    label: "Manipulation",
    hint: "Run chemistry inside the levitating droplet",
  },
};

export const INITIAL_STATE = "off";

export const STATES = {
  off: {
    name: "Levitator Off",
    caption: "Transducer and reflector at rest. No acoustic field, no trap.",
    image: `${STILL}off.png`,
    transitions: [
      { label: "Turn On", clips: [`${VIDEO}poweron.mp4`], to: "idle" },
    ],
  },

  idle: {
    name: "Trap Ready",
    caption:
      "The standing wave is established and stable. The trap is empty and waiting for a sample.",
    image: `${STILL}idle.png`,
    transitions: [
      {
        label: "Amplitude",
        clips: [`${VIDEO}createamp.mp4`],
        to: "amp",
        group: "characteristics",
      },
      {
        label: "Tilt",
        clips: [`${VIDEO}tilt.mp4`],
        to: "idle",
        group: "characteristics",
      },
      {
        label: "Oscillate",
        clips: [`${VIDEO}oscillate.mp4`],
        to: "idle",
        group: "characteristics",
      },
      {
        label: "Inject Solvent",
        clips: [`${VIDEO}injectsolv.mp4`],
        to: "solvent",
        group: "manipulation",
      },
    ],
  },

  amp: {
    name: "Field Visualised",
    caption:
      "The pressure standing wave between transducer and reflector, with its chain of nodes where a sample can sit.",
    image: `${STILL}amp.png`,
    transitions: [
      { label: "Inject", clips: [`${VIDEO}injectfield.mp4`], to: "field" },
    ],
  },

  field: {
    name: "Droplet Trapped",
    caption:
      "A droplet held at a pressure node, supported by acoustic radiation pressure alone. Nothing touches it.",
    image: `${STILL}field.png`,
    transitions: [
      { label: "Increase Amp", clips: [`${VIDEO}ampinc.mp4`], to: "amp-high" },
    ],
  },

  "amp-high": {
    name: "High Amplitude",
    caption:
      "A stronger field flattens the droplet into an oblate disc as radiation pressure overcomes surface tension.",
    image: `${STILL}amp-high.png`,
    transitions: [
      { label: "Decrease Amp", clips: [`${VIDEO}ampdec.mp4`], to: "amp" },
    ],
  },

  solvent: {
    name: "Solvent Droplet",
    caption:
      "A single solvent droplet is levitating. It now acts as a wall-less microreactor.",
    image: `${STILL}solvent.png`,
    transitions: [
      { label: "Add Solvent", clips: [`${VIDEO}addsts.mp4`], to: "solvent-added" },
      { label: "Add Water", clips: [`${VIDEO}addwts.mp4`], to: "two-phase" },
    ],
  },

  "solvent-added": {
    name: "Second Droplet Added",
    caption:
      "A second droplet is parked in the neighbouring node, ready to be combined.",
    image: `${STILL}solvent-added.png`,
    transitions: [
      {
        label: "Mix",

        clips: [`${VIDEO}mixmix.mp4`, `${VIDEO}dropmix.mp4`],
        to: "idle",
      },
    ],
  },

  "two-phase": {
    name: "Two Phases",
    caption:
      "An aqueous and an organic droplet coexist in adjacent nodes without a vessel between them.",
    image: `${STILL}two-phase.png`,
    transitions: [
      { label: "Merge", clips: [`${VIDEO}merge.mp4`], to: "merged" },
    ],
  },

  merged: {
    name: "Biphasic Droplet",
    caption:
      "The two phases are merged into one droplet and meet at a single free interface.",
    image: `${STILL}merged.png`,
    transitions: [
      { label: "Extract", clips: [`${VIDEO}react.mp4`], to: "extracted" },
    ],
  },

  extracted: {
    name: "Extraction Complete",
    caption:
      "The analyte has crossed the interface into the receiving phase, tracked by the colour change.",
    image: `${STILL}extracted.png`,
    transitions: [
      { label: "Separate", clips: [`${VIDEO}sep.mp4`], to: "separated" },
    ],
  },

  separated: {
    name: "Phases Separated",
    caption:
      "The droplet splits back into two, each phase trapped in its own node.",
    image: `${STILL}separated.png`,
    transitions: [
      { label: "Collect", clips: [`${VIDEO}collect.mp4`], to: "one-phase" },
    ],
  },

  "one-phase": {
    name: "Product Isolated",
    caption:
      "Only the loaded phase is left in the trap, ready to be released for analysis.",
    image: `${STILL}one-phase.png`,
    transitions: [
      { label: "Drop", clips: [`${VIDEO}drop.mp4`], to: "idle" },
    ],
  },
};

export function allClips() {
  const seen = new Set();
  for (const state of Object.values(STATES)) {
    for (const t of state.transitions) {
      for (const clip of t.clips) seen.add(clip);
    }
  }
  return [...seen];
}

export function allStills() {
  return Object.values(STATES).map((s) => s.image);
}

export function neighbourhood(stateId) {
  const state = STATES[stateId];
  if (!state) return { clips: [], stills: [] };
  const clips = [];
  const stills = [];
  for (const t of state.transitions) {
    clips.push(...t.clips);
    const target = STATES[t.to];
    if (target) stills.push(target.image);
  }
  return { clips, stills };
}
