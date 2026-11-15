// audio.js — every sound in the game, synthesized with WebAudio. No asset files:
// shots are filtered noise bursts, reloads are clicks, the bomb is a sine blip,
// explosions are low-passed noise with a pitch drop. Created lazily on the first
// user gesture (pointer lock click) so autoplay policy never bites.

export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }

  // A short noise buffer, made once and reused by every noise-based sound.
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function burst(duration, filterFreq, gain, q = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter).connect(env).connect(master);
    src.start();
    src.stop(ctx.currentTime + duration);
  }

  function blip(freq, duration, gain, type = 'sine', slideTo = null) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(env).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    resume() {
      ensure();
      if (ctx.state === 'suspended') ctx.resume();
    },
    shot(kind = 'rifle') {
      if (!ctx) return;
      if (kind === 'pistol') burst(0.09, 2600, 0.5);
      else if (kind === 'smg') burst(0.07, 3200, 0.38);
      else burst(0.12, 2200, 0.6);
      blip(160, 0.05, 0.25, 'square', 60);
    },
    hit() { if (ctx) blip(1150, 0.05, 0.28, 'triangle'); },
    headshot() { if (ctx) { blip(1500, 0.06, 0.3, 'triangle'); blip(900, 0.09, 0.22, 'triangle'); } },
    reloadStart() { if (ctx) blip(420, 0.05, 0.2, 'square'); },
    reloadEnd() { if (ctx) blip(620, 0.06, 0.22, 'square'); },
    dryFire() { if (ctx) blip(220, 0.04, 0.15, 'square'); },
    throwPin() { if (ctx) blip(880, 0.04, 0.18, 'sine'); },
    explosion() {
      if (!ctx) return;
      burst(0.7, 380, 1.0, 0.7);
      blip(90, 0.5, 0.7, 'sine', 34);
    },
    bombBeep(urgent) { if (ctx) blip(urgent ? 1320 : 980, 0.07, 0.3, 'sine'); },
    bombPlanted() { if (ctx) { blip(660, 0.1, 0.3, 'sine'); blip(880, 0.12, 0.3, 'sine'); } },
    roundWin() {
      if (!ctx) return;
      blip(520, 0.12, 0.3, 'triangle');
      setTimeout(() => ctx && blip(780, 0.18, 0.3, 'triangle'), 120);
    },
    roundLose() {
      if (!ctx) return;
      blip(390, 0.14, 0.3, 'triangle');
      setTimeout(() => ctx && blip(260, 0.2, 0.3, 'triangle'), 130);
    },
  };
}
