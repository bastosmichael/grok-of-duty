/**
 * Procedural Web Audio synthesizer — no external audio assets.
 * Gunshots, reloads, hits, footsteps, ambient wind/drone.
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

function makeNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function now(ctx: AudioContext): number {
  return ctx.currentTime;
}

function playOsc(
  ctx: AudioContext,
  dest: AudioNode,
  opts: {
    type?: OscillatorType;
    freq: number;
    freqEnd?: number;
    gain: number;
    attack?: number;
    decay: number;
    delay?: number;
  },
): void {
  const t0 = now(ctx) + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + opts.decay);
  }
  const atk = opts.attack ?? 0.001;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, opts.gain), t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.decay);
  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + opts.decay + 0.02);
}

export function createAudio(): GameAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let ambientGain: GainNode | null = null;
  let ambientNodes: AudioNode[] = [];
  let footAlt = false;
  let disposed = false;
  let noiseCache: AudioBuffer | null = null;

  const ensure = (): { ctx: AudioContext; master: GainNode; sfx: GainNode } | null => {
    if (disposed) return null;
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.95;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      noiseCache = makeNoiseBuffer(ctx, 0.15);
    }
    return { ctx, master: master!, sfx: sfxBus! };
  };

  const resume = async (): Promise<void> => {
    const e = ensure();
    if (!e) return;
    if (e.ctx.state === "suspended") {
      await e.ctx.resume();
    }
  };

  const playGunshot = (ads = false): void => {
    const e = ensure();
    if (!e) return;
    const { ctx: c, sfx: m } = e;
    const t0 = now(c);
    const pitch = 0.9 + Math.random() * 0.2;

    // Layered noise burst — punchier COD AR crack
    const noise = c.createBufferSource();
    noise.buffer = noiseCache ?? makeNoiseBuffer(c, 0.12);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = ads ? 2000 * pitch : 1400 * pitch;
    bp.Q.value = ads ? 1.2 : 0.65;
    const ng = c.createGain();
    ng.gain.setValueAtTime(ads ? 0.72 : 0.9, t0);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + (ads ? 0.055 : 0.085));
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(m);
    noise.start(t0);
    noise.stop(t0 + 0.12);

    // Transient high crack
    const crack = c.createBufferSource();
    crack.buffer = noiseCache ?? makeNoiseBuffer(c, 0.04);
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = ads ? 3800 : 2800;
    const cg = c.createGain();
    cg.gain.setValueAtTime(0.48, t0);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.028);
    crack.connect(hp);
    hp.connect(cg);
    cg.connect(m);
    crack.start(t0);
    crack.stop(t0 + 0.04);

    // Sub thump (chest punch)
    playOsc(c, m, {
      type: "sine",
      freq: 78 * pitch,
      freqEnd: 32,
      gain: ads ? 0.55 : 0.78,
      decay: ads ? 0.09 : 0.14,
    });
    // Mid body
    playOsc(c, m, {
      type: "triangle",
      freq: 210 * pitch,
      freqEnd: 70,
      gain: 0.22,
      decay: 0.08,
    });
    // Mechanical metallic ring
    playOsc(c, m, {
      type: "square",
      freq: 900 * pitch,
      freqEnd: 400,
      gain: 0.06,
      decay: 0.035,
    });
  };

  const playReload = (): void => {
    const e = ensure();
    if (!e) return;
    const { ctx: c, sfx: m } = e;
    // Mag release
    playOsc(c, m, {
      type: "square",
      freq: 480,
      freqEnd: 260,
      gain: 0.14,
      decay: 0.045,
      delay: 0,
    });
    // Mag drop thud
    playOsc(c, m, {
      type: "sine",
      freq: 120,
      freqEnd: 60,
      gain: 0.1,
      decay: 0.06,
      delay: 0.08,
    });
    // Mag seat
    playOsc(c, m, {
      type: "square",
      freq: 300,
      freqEnd: 160,
      gain: 0.2,
      decay: 0.055,
      delay: 0.55,
    });
    // Bolt charge pull
    playOsc(c, m, {
      type: "triangle",
      freq: 480,
      freqEnd: 220,
      gain: 0.12,
      decay: 0.08,
      delay: 1.0,
    });
    // Bolt release slam
    playOsc(c, m, {
      type: "triangle",
      freq: 720,
      freqEnd: 180,
      gain: 0.18,
      decay: 0.07,
      delay: 1.25,
    });
    // Metallic ring
    playOsc(c, m, {
      type: "sine",
      freq: 1600,
      freqEnd: 900,
      gain: 0.05,
      decay: 0.1,
      delay: 1.28,
    });
  };

  const playHit = (): void => {
    const e = ensure();
    if (!e) return;
    const { ctx: c, sfx: m } = e;
    // Crisp COD hitmarker tick
    playOsc(c, m, {
      type: "square",
      freq: 2400,
      freqEnd: 1800,
      gain: 0.22,
      decay: 0.035,
    });
    playOsc(c, m, {
      type: "sine",
      freq: 3600,
      freqEnd: 2800,
      gain: 0.12,
      decay: 0.045,
    });
  };

  const playKill = (): void => {
    const e = ensure();
    if (!e) return;
    const { ctx: c, sfx: m } = e;
    // Rewarding confirmation
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      playOsc(c, m, {
        type: "sine",
        freq: f,
        freqEnd: f * 1.02,
        gain: 0.14 - i * 0.02,
        decay: 0.2 + i * 0.04,
        delay: i * 0.025,
      });
    });
    playOsc(c, m, {
      type: "triangle",
      freq: 1046.5,
      freqEnd: 700,
      gain: 0.1,
      decay: 0.14,
      delay: 0.05,
    });
    // Soft thump
    playOsc(c, m, {
      type: "sine",
      freq: 90,
      freqEnd: 40,
      gain: 0.15,
      decay: 0.12,
    });
  };

  const playFootstep = (): void => {
    const e = ensure();
    if (!e) return;
    const { ctx: c, sfx: m } = e;
    const t0 = now(c);
    footAlt = !footAlt;
    const pitch = footAlt ? 1.05 : 0.92;

    const noise = c.createBufferSource();
    noise.buffer = noiseCache ?? makeNoiseBuffer(c, 0.08);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 300 * pitch;
    lp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.065);
    noise.connect(lp);
    lp.connect(g);
    g.connect(m);
    noise.start(t0);
    noise.stop(t0 + 0.08);

    playOsc(c, m, {
      type: "sine",
      freq: 65 * pitch,
      freqEnd: 32,
      gain: 0.11,
      decay: 0.055,
    });
  };

  const playHurt = (): void => {
    const e = ensure();
    if (!e) return;
    const { ctx: c, sfx: m } = e;
    playOsc(c, m, {
      type: "sawtooth",
      freq: 100,
      freqEnd: 48,
      gain: 0.22,
      decay: 0.22,
    });
    playOsc(c, m, {
      type: "sawtooth",
      freq: 108,
      freqEnd: 52,
      gain: 0.14,
      decay: 0.2,
    });
    playOsc(c, m, {
      type: "sine",
      freq: 48,
      freqEnd: 28,
      gain: 0.28,
      decay: 0.28,
    });
  };

  const playEmpty = (): void => {
    const e = ensure();
    if (!e) return;
    const { ctx: c, sfx: m } = e;
    // Dry hammer / bolt click — metallic and audible
    playOsc(c, m, {
      type: "square",
      freq: 220,
      freqEnd: 90,
      gain: 0.16,
      decay: 0.045,
    });
    playOsc(c, m, {
      type: "triangle",
      freq: 140,
      freqEnd: 70,
      gain: 0.1,
      decay: 0.055,
      delay: 0.015,
    });
    playOsc(c, m, {
      type: "sine",
      freq: 1800,
      freqEnd: 900,
      gain: 0.04,
      decay: 0.03,
      delay: 0.005,
    });
  };

  const stopAmbient = (): void => {
    ambientNodes.forEach((n) => {
      try {
        if ("stop" in n && typeof (n as AudioBufferSourceNode).stop === "function") {
          (n as AudioBufferSourceNode).stop();
        }
        n.disconnect();
      } catch {
        /* already stopped */
      }
    });
    ambientNodes = [];
    if (ambientGain) {
      try {
        ambientGain.disconnect();
      } catch {
        /* noop */
      }
      ambientGain = null;
    }
  };

  const setAmbient = (on: boolean): void => {
    const e = ensure();
    if (!e) return;
    const { ctx: c, master: m } = e;

    if (!on) {
      stopAmbient();
      return;
    }
    if (ambientGain) return;

    ambientGain = c.createGain();
    ambientGain.gain.value = 0.04;
    ambientGain.connect(m);

    const windBuf = makeNoiseBuffer(c, 2.5);
    const wind = c.createBufferSource();
    wind.buffer = windBuf;
    wind.loop = true;
    const windFilter = c.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 400;
    windFilter.Q.value = 0.4;
    const windGain = c.createGain();
    windGain.gain.value = 0.55;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ambientGain);
    wind.start();
    ambientNodes.push(wind, windFilter, windGain);

    const drone = c.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 48;
    const drone2 = c.createOscillator();
    drone2.type = "triangle";
    drone2.frequency.value = 72.5;
    const droneGain = c.createGain();
    droneGain.gain.value = 0.22;
    const droneFilter = c.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 120;
    drone.connect(droneFilter);
    drone2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(ambientGain);
    drone.start();
    drone2.start();
    ambientNodes.push(drone, drone2, droneFilter, droneGain, ambientGain);
  };

  const dispose = (): void => {
    disposed = true;
    stopAmbient();
    if (sfxBus) {
      try {
        sfxBus.disconnect();
      } catch {
        /* noop */
      }
      sfxBus = null;
    }
    if (master) {
      try {
        master.disconnect();
      } catch {
        /* noop */
      }
      master = null;
    }
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
    noiseCache = null;
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
