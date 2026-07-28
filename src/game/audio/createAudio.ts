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

  const playGunshot = (ads = false): void => {
    const rig = ensure();
    if (!rig || !transientNoise) return;
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
    if (ambientGain) return;
    if (ambientStopTimer) {
      clearTimeout(ambientStopTimer);
      ambientStopTimer = null;
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
    droneGain.gain.value = 0.15;
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

    wind.start();
    windLfo.start();
    drone.start();
    droneFifth.start();
    pulse.start();
    ambientNodes = [
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
