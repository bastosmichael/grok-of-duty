/**
 * Procedural Web Audio mix for the combat loop.
 *
 * The signal graph separates weapons, UI feedback, foley, and ambience before
 * a master compressor. This keeps rapid fire forceful without clipping and
 * leaves hit/kill confirmation intelligible over the weapon transient.
 */

export type GameAudio = {
  resume: () => Promise<void>;
  playGunshot: (ads?: boolean) => void;
  playReload: () => void;
  playHit: () => void;
  playKill: () => void;
  playFootstep: () => void;
  playHurt: () => void;
  playEmpty: () => void;
  setAmbient: (on: boolean) => void;
  dispose: () => void;
};

type AudioRig = {
  ctx: AudioContext;
  master: GainNode;
  weapons: GainNode;
  feedback: GainNode;
  foley: GainNode;
  ambience: GainNode;
  reverb: ConvolverNode;
};

function makeNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    data[i] = white * 0.78 + brown * 0.22;
  }

  return buffer;
}

function makeImpulse(ctx: AudioContext, durationSec: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return impulse;
}

function playOsc(
  ctx: AudioContext,
  destination: AudioNode,
  options: {
    type?: OscillatorType;
    freq: number;
    freqEnd?: number;
    gain: number;
    attack?: number;
    decay: number;
    delay?: number;
  },
): void {
  const start = ctx.currentTime + (options.delay ?? 0);
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();
  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(Math.max(1, options.freq), start);
  if (options.freqEnd != null) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, options.freqEnd),
      start + options.decay,
    );
  }

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, options.gain),
    start + (options.attack ?? 0.001),
  );
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + options.decay);
  oscillator.connect(envelope);
  envelope.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + options.decay + 0.025);
}

function playNoise(
  ctx: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  options: {
    gain: number;
    decay: number;
    delay?: number;
    attack?: number;
    filter: BiquadFilterType;
    frequency: number;
    frequencyEnd?: number;
    q?: number;
    playbackRate?: number;
  },
): void {
  const start = ctx.currentTime + (options.delay ?? 0);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const envelope = ctx.createGain();

  source.buffer = buffer;
  source.playbackRate.value = options.playbackRate ?? 1;
  filter.type = options.filter;
  filter.frequency.setValueAtTime(options.frequency, start);
  if (options.frequencyEnd != null) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(1, options.frequencyEnd),
      start + options.decay,
    );
  }
  filter.Q.value = options.q ?? 0.7;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, options.gain),
    start + (options.attack ?? 0.001),
  );
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + options.decay);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);
  source.start(start);
  source.stop(
    start + Math.max(options.decay + 0.03, buffer.duration / (options.playbackRate ?? 1)),
  );
}

type ScoreSource = OscillatorNode | AudioBufferSourceNode;
const SCORE_ROOTS = [36.708, 29.135, 32.703, 38.891] as const;
const SCORE_MOTIF = [4, 6, 4.7568, 5.3394, 4, 7.1262, 6, 4.7568] as const;
const SCORE_BEAT_SECONDS = 60 / 82;

function playScoreTone(
  ctx: AudioContext,
  destination: AudioNode,
  activeSources: Set<ScoreSource>,
  transientNodes: Set<AudioNode>,
  options: {
    start: number;
    frequency: number;
    frequencyEnd?: number;
    gain: number;
    duration: number;
    attack: number;
    type: OscillatorType;
    filterFrequency: number;
    pan?: number;
  },
): void {
  const oscillator = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const envelope = ctx.createGain();
  const panner = ctx.createStereoPanner();
  const end = options.start + options.duration;

  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.frequency, options.start);
  if (options.frequencyEnd) {
    oscillator.frequency.exponentialRampToValueAtTime(options.frequencyEnd, end);
  }
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(options.filterFrequency, options.start);
  filter.Q.value = 0.55;
  envelope.gain.setValueAtTime(0.0001, options.start);
  envelope.gain.exponentialRampToValueAtTime(options.gain, options.start + options.attack);
  envelope.gain.setTargetAtTime(0.0001, end - Math.min(0.24, options.duration * 0.35), 0.09);
  panner.pan.value = options.pan ?? 0;

  oscillator.connect(filter);
  filter.connect(envelope);
  envelope.connect(panner);
  panner.connect(destination);

  const nodes: AudioNode[] = [oscillator, filter, envelope, panner];
  activeSources.add(oscillator);
  for (const node of nodes) transientNodes.add(node);
  oscillator.onended = () => {
    activeSources.delete(oscillator);
    for (const node of nodes) {
      transientNodes.delete(node);
      try {
        node.disconnect();
      } catch {
        // The music graph may already be disconnected during teardown.
      }
    }
  };
  oscillator.start(options.start);
  oscillator.stop(end + 0.08);
}

function playScorePercussion(
  ctx: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  activeSources: Set<ScoreSource>,
  transientNodes: Set<AudioNode>,
  options: {
    start: number;
    gain: number;
    highpass: number;
    pan: number;
  },
): void {
  const source = ctx.createBufferSource();
  const highpass = ctx.createBiquadFilter();
  const lowpass = ctx.createBiquadFilter();
  const envelope = ctx.createGain();
  const panner = ctx.createStereoPanner();
  source.buffer = buffer;
  source.playbackRate.value = 1.25;
  highpass.type = "highpass";
  highpass.frequency.value = options.highpass;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 5200;
  envelope.gain.setValueAtTime(options.gain, options.start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, options.start + 0.085);
  panner.pan.value = options.pan;

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(envelope);
  envelope.connect(panner);
  panner.connect(destination);

  const nodes: AudioNode[] = [source, highpass, lowpass, envelope, panner];
  activeSources.add(source);
  for (const node of nodes) transientNodes.add(node);
  source.onended = () => {
    activeSources.delete(source);
    for (const node of nodes) {
      transientNodes.delete(node);
      try {
        node.disconnect();
      } catch {
        // The music graph may already be disconnected during teardown.
      }
    }
  };
  source.start(options.start);
  source.stop(options.start + 0.11);
}

export function createAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let weaponsBus: GainNode | null = null;
  let feedbackBus: GainNode | null = null;
  let foleyBus: GainNode | null = null;
  let ambientBus: GainNode | null = null;
  let reverb: ConvolverNode | null = null;
  let ambientGain: GainNode | null = null;
  let ambientNodes: AudioNode[] = [];
  let ambientStopTimer: ReturnType<typeof setTimeout> | null = null;
  let scoreTimer: ReturnType<typeof setInterval> | null = null;
  let scoreGain: GainNode | null = null;
  let scorePadOscillators: OscillatorNode[] = [];
  let scoreNextBeat = 0;
  let scoreBeat = 0;
  let combatEnergy = 0;
  let combatEnergyTime = 0;
  const activeScoreSources = new Set<ScoreSource>();
  const scoreTransientNodes = new Set<AudioNode>();
  let transientNoise: AudioBuffer | null = null;
  let footAlt = false;
  let disposed = false;

  const ensure = (): AudioRig | null => {
    if (disposed) return null;
    if (!ctx) {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return null;

      ctx = new AudioContextConstructor();
      master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      weaponsBus = ctx.createGain();
      feedbackBus = ctx.createGain();
      foleyBus = ctx.createGain();
      ambientBus = ctx.createGain();
      reverb = ctx.createConvolver();
      const reverbReturn = ctx.createGain();

      master.gain.value = 0.74;
      compressor.threshold.value = -15;
      compressor.knee.value = 9;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.16;
      weaponsBus.gain.value = 0.82;
      feedbackBus.gain.value = 0.58;
      foleyBus.gain.value = 0.72;
      ambientBus.gain.value = 0.11;
      reverb.buffer = makeImpulse(ctx, 0.52, 3.1);
      reverbReturn.gain.value = 0.13;

      weaponsBus.connect(master);
      feedbackBus.connect(master);
      foleyBus.connect(master);
      ambientBus.connect(master);
      reverb.connect(reverbReturn);
      reverbReturn.connect(master);
      master.connect(compressor);
      compressor.connect(ctx.destination);
      transientNoise = makeNoiseBuffer(ctx, 0.22);
    }

    return {
      ctx,
      master: master!,
      weapons: weaponsBus!,
      feedback: feedbackBus!,
      foley: foleyBus!,
      ambience: ambientBus!,
      reverb: reverb!,
    };
  };

  const resume = async (): Promise<void> => {
    const rig = ensure();
    if (rig?.ctx.state === "suspended") {
      await rig.ctx.resume();
    }
  };

  const currentCombatEnergy = (time: number): number => {
    const elapsed = Math.max(0, time - combatEnergyTime);
    combatEnergy = Math.max(0, combatEnergy - elapsed * 0.035);
    combatEnergyTime = time;
    return combatEnergy;
  };

  const nudgeCombat = (time: number, amount: number): void => {
    const current = currentCombatEnergy(time);
    combatEnergy = Math.min(1, current + amount * (1 - current));
  };

  const playGunshot = (ads = false): void => {
    const rig = ensure();
    if (!rig || !transientNoise) return;
    nudgeCombat(rig.ctx.currentTime, 0.075);
    const pitch = 0.94 + Math.random() * 0.12;

    // Muzzle pressure: broad body, supersonic crack, and a short low-frequency push.
    playNoise(rig.ctx, rig.weapons, transientNoise, {
      gain: ads ? 0.55 : 0.68,
      decay: ads ? 0.072 : 0.09,
      filter: "bandpass",
      frequency: (ads ? 1650 : 1350) * pitch,
      frequencyEnd: 620,
      q: 0.62,
      playbackRate: 0.9 + Math.random() * 0.16,
    });
    playNoise(rig.ctx, rig.weapons, transientNoise, {
      gain: 0.34,
      decay: 0.022,
      filter: "highpass",
      frequency: 3500 * pitch,
      frequencyEnd: 6100,
      q: 0.35,
      playbackRate: 1.25,
    });
    playOsc(rig.ctx, rig.weapons, {
      type: "sine",
      freq: 92 * pitch,
      freqEnd: 34,
      gain: ads ? 0.34 : 0.46,
      decay: ads ? 0.09 : 0.125,
    });
    playOsc(rig.ctx, rig.weapons, {
      type: "triangle",
      freq: 235 * pitch,
      freqEnd: 74,
      gain: 0.14,
      decay: 0.07,
    });

    // Receiver action trails the muzzle blast by a few milliseconds.
    playOsc(rig.ctx, rig.foley, {
      type: "square",
      freq: 1250 * pitch,
      freqEnd: 390,
      gain: 0.045,
      decay: 0.032,
      delay: 0.018,
    });
    playNoise(rig.ctx, rig.foley, transientNoise, {
      gain: 0.06,
      decay: 0.027,
      delay: 0.026,
      filter: "bandpass",
      frequency: 2800,
      q: 3.2,
      playbackRate: 1.4,
    });

    // A quiet, filtered room reflection gives the shot scale without washing it out.
    playNoise(rig.ctx, rig.reverb, transientNoise, {
      gain: ads ? 0.14 : 0.2,
      decay: 0.12,
      delay: 0.018,
      attack: 0.008,
      filter: "lowpass",
      frequency: 1900,
      frequencyEnd: 520,
      q: 0.3,
      playbackRate: 0.62,
    });
  };

  const playReload = (): void => {
    const rig = ensure();
    if (!rig || !transientNoise) return;

    const click = (delay: number, frequency: number, gain: number) => {
      playOsc(rig.ctx, rig.foley, {
        type: "square",
        freq: frequency,
        freqEnd: frequency * 0.38,
        gain,
        decay: 0.04,
        delay,
      });
      playNoise(rig.ctx, rig.foley, transientNoise!, {
        gain: gain * 0.35,
        decay: 0.025,
        delay,
        filter: "highpass",
        frequency: frequency * 1.9,
        q: 1.5,
        playbackRate: 1.5,
      });
    };

    click(0, 620, 0.09); // release
    playOsc(rig.ctx, rig.foley, {
      type: "sine",
      freq: 105,
      freqEnd: 52,
      gain: 0.075,
      decay: 0.075,
      delay: 0.095,
    });
    click(0.53, 410, 0.13); // magazine seats
    click(0.58, 760, 0.045); // retention tap
    playNoise(rig.ctx, rig.foley, transientNoise, {
      gain: 0.055,
      decay: 0.12,
      delay: 0.96,
      filter: "bandpass",
      frequency: 920,
      frequencyEnd: 310,
      q: 2,
      playbackRate: 0.7,
    });
    click(1.2, 980, 0.11); // bolt release
    playOsc(rig.ctx, rig.reverb, {
      type: "sine",
      freq: 1750,
      freqEnd: 720,
      gain: 0.025,
      decay: 0.13,
      delay: 1.21,
    });
  };

  const playHit = (): void => {
    const rig = ensure();
    if (!rig) return;
    nudgeCombat(rig.ctx.currentTime, 0.09);
    playOsc(rig.ctx, rig.feedback, {
      type: "square",
      freq: 2450,
      freqEnd: 1780,
      gain: 0.16,
      decay: 0.032,
    });
    playOsc(rig.ctx, rig.feedback, {
      type: "sine",
      freq: 3850,
      freqEnd: 2700,
      gain: 0.075,
      decay: 0.045,
      delay: 0.004,
    });
  };

  const playKill = (): void => {
    const rig = ensure();
    if (!rig) return;
    nudgeCombat(rig.ctx.currentTime, 0.24);

    // Low confirmation impact followed by a compact, non-musical upward signature.
    playOsc(rig.ctx, rig.feedback, {
      type: "sine",
      freq: 86,
      freqEnd: 38,
      gain: 0.15,
      decay: 0.14,
    });
    [587.33, 739.99, 880].forEach((frequency, index) => {
      playOsc(rig.ctx, rig.feedback, {
        type: index === 2 ? "triangle" : "sine",
        freq: frequency,
        freqEnd: frequency * 1.015,
        gain: 0.09 - index * 0.014,
        attack: 0.004,
        decay: 0.18 + index * 0.025,
        delay: 0.018 + index * 0.032,
      });
    });
  };

  const playFootstep = (): void => {
    const rig = ensure();
    if (!rig || !transientNoise) return;
    footAlt = !footAlt;
    const pitch = (footAlt ? 1.06 : 0.93) * (0.96 + Math.random() * 0.08);

    playNoise(rig.ctx, rig.foley, transientNoise, {
      gain: 0.11,
      decay: 0.075,
      filter: "lowpass",
      frequency: 430 * pitch,
      frequencyEnd: 120,
      q: 0.8,
      playbackRate: pitch,
    });
    playNoise(rig.ctx, rig.foley, transientNoise, {
      gain: 0.027,
      decay: 0.035,
      delay: 0.007,
      filter: "bandpass",
      frequency: 2100 * pitch,
      q: 1.1,
      playbackRate: 1.2,
    });
    playOsc(rig.ctx, rig.foley, {
      type: "sine",
      freq: 70 * pitch,
      freqEnd: 34,
      gain: 0.07,
      decay: 0.06,
    });
  };

  const playHurt = (): void => {
    const rig = ensure();
    if (!rig || !transientNoise) return;
    const time = rig.ctx.currentTime;
    nudgeCombat(time, 0.2);

    // Briefly duck the whole mix so incoming damage reads immediately.
    rig.master.gain.cancelScheduledValues(time);
    rig.master.gain.setValueAtTime(rig.master.gain.value, time);
    rig.master.gain.exponentialRampToValueAtTime(0.46, time + 0.018);
    rig.master.gain.exponentialRampToValueAtTime(0.74, time + 0.32);

    playNoise(rig.ctx, rig.feedback, transientNoise, {
      gain: 0.19,
      decay: 0.19,
      filter: "lowpass",
      frequency: 780,
      frequencyEnd: 120,
      q: 0.5,
      playbackRate: 0.72,
    });
    playOsc(rig.ctx, rig.feedback, {
      type: "sawtooth",
      freq: 116,
      freqEnd: 44,
      gain: 0.105,
      decay: 0.2,
    });
    playOsc(rig.ctx, rig.feedback, {
      type: "sine",
      freq: 53,
      freqEnd: 27,
      gain: 0.18,
      decay: 0.29,
    });
  };

  const playEmpty = (): void => {
    const rig = ensure();
    if (!rig || !transientNoise) return;
    playOsc(rig.ctx, rig.foley, {
      type: "square",
      freq: 290,
      freqEnd: 92,
      gain: 0.105,
      decay: 0.044,
    });
    playNoise(rig.ctx, rig.foley, transientNoise, {
      gain: 0.045,
      decay: 0.027,
      delay: 0.006,
      filter: "bandpass",
      frequency: 1850,
      q: 4.2,
      playbackRate: 1.6,
    });
    playOsc(rig.ctx, rig.foley, {
      type: "sine",
      freq: 1350,
      freqEnd: 680,
      gain: 0.018,
      decay: 0.07,
      delay: 0.01,
    });
  };

  const clearAmbient = (): void => {
    if (ambientStopTimer) {
      clearTimeout(ambientStopTimer);
      ambientStopTimer = null;
    }
    if (scoreTimer) {
      clearInterval(scoreTimer);
      scoreTimer = null;
    }
    for (const source of activeScoreSources) {
      try {
        source.stop();
      } catch {
        // A scheduled voice may already have ended.
      }
    }
    activeScoreSources.clear();
    for (const node of scoreTransientNodes) {
      try {
        node.disconnect();
      } catch {
        // The transient may have disconnected through its onended callback.
      }
    }
    scoreTransientNodes.clear();
    ambientNodes.forEach((node) => {
      try {
        if (
          (node instanceof AudioBufferSourceNode || node instanceof OscillatorNode) &&
          typeof node.stop === "function"
        ) {
          node.stop();
        }
        node.disconnect();
      } catch {
        // A source can already be stopped during teardown.
      }
    });
    ambientNodes = [];
    ambientGain = null;
    scoreGain = null;
    scorePadOscillators = [];
    scoreNextBeat = 0;
    scoreBeat = 0;
  };

  const setAmbient = (on: boolean): void => {
    const rig = ensure();
    if (!rig) return;

    if (!on) {
      if (!ambientGain) return;
      const gain = ambientGain;
      const time = rig.ctx.currentTime;
      gain.gain.cancelScheduledValues(time);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
      ambientStopTimer = setTimeout(clearAmbient, 260);
      return;
    }
    if (ambientGain) {
      if (ambientStopTimer) {
        clearTimeout(ambientStopTimer);
        ambientStopTimer = null;
      }
      const time = rig.ctx.currentTime;
      ambientGain.gain.cancelScheduledValues(time);
      ambientGain.gain.setValueAtTime(Math.max(0.0001, ambientGain.gain.value), time);
      ambientGain.gain.exponentialRampToValueAtTime(0.8, time + 0.45);
      return;
    }

    const time = rig.ctx.currentTime;
    ambientGain = rig.ctx.createGain();
    ambientGain.gain.setValueAtTime(0.0001, time);
    ambientGain.gain.exponentialRampToValueAtTime(0.8, time + 1.4);
    ambientGain.connect(rig.ambience);

    const wind = rig.ctx.createBufferSource();
    const windFilter = rig.ctx.createBiquadFilter();
    const windGain = rig.ctx.createGain();
    wind.buffer = makeNoiseBuffer(rig.ctx, 4);
    wind.loop = true;
    windFilter.type = "bandpass";
    windFilter.frequency.value = 390;
    windFilter.Q.value = 0.32;
    windGain.gain.value = 0.36;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ambientGain);

    const windLfo = rig.ctx.createOscillator();
    const windLfoDepth = rig.ctx.createGain();
    windLfo.type = "sine";
    windLfo.frequency.value = 0.085;
    windLfoDepth.gain.value = 120;
    windLfo.connect(windLfoDepth);
    windLfoDepth.connect(windFilter.frequency);

    const drone = rig.ctx.createOscillator();
    const droneFifth = rig.ctx.createOscillator();
    const droneFilter = rig.ctx.createBiquadFilter();
    const droneGain = rig.ctx.createGain();
    drone.type = "sine";
    drone.frequency.value = 43;
    droneFifth.type = "triangle";
    droneFifth.frequency.value = 64.5;
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 110;
    droneGain.gain.value = 0.09;
    drone.connect(droneFilter);
    droneFifth.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(ambientGain);

    const pulse = rig.ctx.createOscillator();
    const pulseGain = rig.ctx.createGain();
    pulse.type = "sine";
    pulse.frequency.value = 0.17;
    pulseGain.gain.value = 0.045;
    pulse.connect(pulseGain);
    pulseGain.connect(droneGain.gain);

    // Original procedural tactical score: a restrained four-chord low pad,
    // sparse modal motif, and pulse layer whose density follows recent combat.
    // All notes are synthesized in real time; no external recording is used.
    scoreGain = rig.ctx.createGain();
    const scoreFilter = rig.ctx.createBiquadFilter();
    const scorePadGain = rig.ctx.createGain();
    const scoreReverbSend = rig.ctx.createGain();
    const scoreFilterLfo = rig.ctx.createOscillator();
    const scoreFilterDepth = rig.ctx.createGain();
    scoreGain.gain.value = 0.38;
    scoreFilter.type = "lowpass";
    scoreFilter.frequency.value = 520;
    scoreFilter.Q.value = 0.48;
    scorePadGain.gain.value = 0.14;
    scoreReverbSend.gain.value = 0.12;
    scoreFilterLfo.type = "sine";
    scoreFilterLfo.frequency.value = 0.028;
    scoreFilterDepth.gain.value = 95;

    scorePadGain.connect(scoreFilter);
    scoreFilter.connect(scoreGain);
    scoreGain.connect(ambientGain);
    scoreGain.connect(scoreReverbSend);
    scoreReverbSend.connect(rig.reverb);
    scoreFilterLfo.connect(scoreFilterDepth);
    scoreFilterDepth.connect(scoreFilter.frequency);

    const padRatios = [1, 1.5, 2.3784] as const;
    scorePadOscillators = padRatios.map((ratio, index) => {
      const oscillator = rig.ctx.createOscillator();
      const voiceGain = rig.ctx.createGain();
      oscillator.type = index === 0 ? "sine" : index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = SCORE_ROOTS[0] * ratio;
      oscillator.detune.value = index === 1 ? -4 : index === 2 ? 3 : 0;
      voiceGain.gain.value = index === 0 ? 0.72 : index === 1 ? 0.3 : 0.12;
      oscillator.connect(voiceGain);
      voiceGain.connect(scorePadGain);
      oscillator.start(time);
      ambientNodes.push(voiceGain);
      return oscillator;
    });

    scoreNextBeat = time + 0.08;
    scoreBeat = 0;
    combatEnergyTime = time;

    const scheduleScore = (): void => {
      if (!scoreGain || !transientNoise || disposed) return;
      const now = rig.ctx.currentTime;
      const energy = currentCombatEnergy(now);
      scoreGain.gain.setTargetAtTime(0.34 + energy * 0.16, now, 0.6);
      scoreFilter.frequency.setTargetAtTime(480 + energy * 520, now, 0.8);

      while (scoreNextBeat < now + 0.65) {
        const beat = scoreBeat;
        const chordIndex = Math.floor(beat / 8) % SCORE_ROOTS.length;
        const root = SCORE_ROOTS[chordIndex]!;

        if (beat % 8 === 0) {
          for (let index = 0; index < scorePadOscillators.length; index++) {
            scorePadOscillators[index]!.frequency.setTargetAtTime(
              root * padRatios[index]!,
              scoreNextBeat,
              0.42,
            );
          }
        }

        // Sub pulse is half-time while calm and becomes quarter-time only
        // after sustained action. It remains below the weapon transient band.
        if (beat % 2 === 0 || energy > 0.48) {
          playScoreTone(rig.ctx, scoreGain, activeScoreSources, scoreTransientNodes, {
            start: scoreNextBeat,
            frequency: root * (beat % 4 === 0 ? 1 : 1.5),
            frequencyEnd: root * 0.88,
            gain: 0.075 + energy * 0.045,
            duration: 0.3,
            attack: 0.012,
            type: "sine",
            filterFrequency: 150,
          });
        }

        // A compact, asymmetric motif avoids an obvious loop. Calm passages
        // leave large spaces; combat reveals connective notes and metal ticks.
        if (beat % 4 === 2 || energy > 0.32) {
          const ratio = SCORE_MOTIF[beat % SCORE_MOTIF.length]!;
          playScoreTone(rig.ctx, scoreGain, activeScoreSources, scoreTransientNodes, {
            start: scoreNextBeat + 0.018,
            frequency: root * ratio,
            gain: 0.016 + energy * 0.013,
            duration: 0.74 + (beat % 3) * 0.13,
            attack: 0.035,
            type: "triangle",
            filterFrequency: 1100 + energy * 900,
            pan: ((beat % 5) - 2) * 0.18,
          });
        }

        if (energy > 0.28 && (beat % 2 === 1 || energy > 0.7)) {
          playScorePercussion(
            rig.ctx,
            scoreGain,
            transientNoise,
            activeScoreSources,
            scoreTransientNodes,
            {
              start: scoreNextBeat,
              gain: 0.014 + energy * 0.018,
              highpass: 1500 + (beat % 3) * 380,
              pan: beat % 2 === 0 ? -0.24 : 0.24,
            },
          );
        }

        scoreBeat += 1;
        scoreNextBeat += SCORE_BEAT_SECONDS;
      }
    };

    wind.start();
    windLfo.start();
    drone.start();
    droneFifth.start();
    pulse.start();
    scoreFilterLfo.start(time);
    scheduleScore();
    scoreTimer = setInterval(scheduleScore, 140);
    ambientNodes = [
      ...ambientNodes,
      wind,
      windFilter,
      windGain,
      windLfo,
      windLfoDepth,
      drone,
      droneFifth,
      droneFilter,
      droneGain,
      pulse,
      pulseGain,
      ...scorePadOscillators,
      scorePadGain,
      scoreFilter,
      scoreGain,
      scoreReverbSend,
      scoreFilterLfo,
      scoreFilterDepth,
      ambientGain,
    ];
  };

  const dispose = (): void => {
    disposed = true;
    clearAmbient();
    for (const node of [weaponsBus, feedbackBus, foleyBus, ambientBus, reverb, master]) {
      try {
        node?.disconnect();
      } catch {
        // Ignore nodes already disconnected by browser teardown.
      }
    }
    weaponsBus = null;
    feedbackBus = null;
    foleyBus = null;
    ambientBus = null;
    reverb = null;
    master = null;
    transientNoise = null;
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
  };

  return {
    resume,
    playGunshot,
    playReload,
    playHit,
    playKill,
    playFootstep,
    playHurt,
    playEmpty,
    setAmbient,
    dispose,
  };
}
