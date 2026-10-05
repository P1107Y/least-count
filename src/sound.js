// Small synthesized sound effects (FR-40); no audio files needed.
const MUTE_KEY = 'lc.muted';
let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch {
  /* ignore */
}

export const isMuted = () => muted;
export const setMuted = (value) => {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
};

const tone = (freq, start, duration, { type = 'sine', gain = 0.12, slide = 0 } = {}) => {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, ctx.currentTime + start + duration);
  amp.gain.setValueAtTime(0, ctx.currentTime + start);
  amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
};

const noise = (start, duration, gain = 0.08) => {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const amp = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1800;
  amp.gain.value = gain;
  src.buffer = buffer;
  src.connect(filter).connect(amp).connect(ctx.destination);
  src.start(ctx.currentTime + start);
};

const SOUNDS = {
  deal: () => [0, 0.07, 0.14, 0.21, 0.28].forEach((t) => noise(t, 0.06, 0.06)),
  discard: () => noise(0, 0.09, 0.09),
  draw: () => {
    noise(0, 0.07, 0.05);
    tone(520, 0.02, 0.08, { gain: 0.05 });
  },
  turn: () => {
    tone(660, 0, 0.12, { gain: 0.08 });
    tone(880, 0.1, 0.16, { gain: 0.08 });
  },
  show: () => {
    tone(392, 0, 0.18, { type: 'triangle' });
    tone(523, 0.12, 0.18, { type: 'triangle' });
    tone(784, 0.24, 0.3, { type: 'triangle' });
  },
  fail: () => tone(300, 0, 0.45, { type: 'sawtooth', gain: 0.06, slide: -140 }),
  eliminated: () => tone(220, 0, 0.6, { type: 'square', gain: 0.05, slide: -110 }),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.3, { type: 'triangle' })),
  error: () => tone(180, 0, 0.15, { type: 'square', gain: 0.04 }),
  pop: () => tone(740, 0, 0.09, { gain: 0.06, slide: 260 }),
};

export const play = (name) => {
  if (muted || !SOUNDS[name]) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[name]();
  } catch {
    /* audio unavailable */
  }
};
