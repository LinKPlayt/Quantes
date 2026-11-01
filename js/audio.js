// WarBreach — synthesized sound effects (Web Audio, no files) and phone vibration.
'use strict';

const Sound = (() => {
  let ac = null, master = null, noiseBuf = null;
  const last = {};
  let enabled = true;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }

  function noise(dur, filterType, freq, vol, q = 1) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain();
    const t = ac.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, vol, slideTo, delay = 0) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const t = ac.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const FX = {
    mg:      () => noise(0.05, 'highpass', 1800, 0.18),
    rifle:   () => noise(0.04, 'bandpass', 2500, 0.06, 2),
    sniper:  () => { noise(0.12, 'highpass', 1200, 0.35); tone(900, 0.08, 'square', 0.03, 300); },
    cannon:  () => { noise(0.25, 'lowpass', 500, 0.5); tone(120, 0.2, 'sine', 0.3, 50); },
    mortar:  () => { tone(300, 0.12, 'sine', 0.15, 120); noise(0.1, 'lowpass', 800, 0.2); },
    rocket:  () => noise(0.3, 'bandpass', 900, 0.18, 0.7),
    flame:   () => noise(0.15, 'bandpass', 400, 0.12, 0.5),
    boom:    () => { noise(0.6, 'lowpass', 350, 0.7); tone(80, 0.4, 'sine', 0.35, 35); },
    bigboom: () => { noise(1.1, 'lowpass', 250, 0.9); tone(60, 0.8, 'sine', 0.5, 25); },
    build:   () => { tone(520, 0.08, 'square', 0.06); tone(780, 0.12, 'square', 0.06, null, 0.08); },
    done:    () => { tone(660, 0.1, 'triangle', 0.12); tone(880, 0.1, 'triangle', 0.12, null, 0.1); tone(1320, 0.18, 'triangle', 0.12, null, 0.2); },
    collect: () => { tone(1200, 0.07, 'sine', 0.12); tone(1600, 0.1, 'sine', 0.12, null, 0.06); },
    click:   () => tone(700, 0.04, 'square', 0.04),
    error:   () => { tone(220, 0.12, 'square', 0.06); tone(180, 0.15, 'square', 0.06, null, 0.1); },
    alarm:   () => { for (let i = 0; i < 3; i++) tone(520, 0.18, 'sawtooth', 0.07, 700, i * 0.25); },
    boss:    () => { for (let i = 0; i < 4; i++) tone(180, 0.3, 'sawtooth', 0.1, 120, i * 0.32); },
    win:     () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, null, i * 0.12)); },
    lose:    () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, null, i * 0.18)); },
    plane:   () => noise(1.6, 'bandpass', 300, 0.25, 0.4),
    heal:    () => { tone(500, 0.3, 'sine', 0.1, 1000); },
    medal:   () => { tone(1046, 0.1, 'triangle', 0.12); tone(1568, 0.25, 'triangle', 0.12, null, 0.1); },
  };
  // minimum ms between repeats so rapid fire doesn't stack into noise
  const GAP = { mg: 70, rifle: 90, flame: 120, boom: 60, rocket: 80, collect: 60, mortar: 100, cannon: 60 };

  function play(name) {
    if (!enabled || !ac || ac.state !== 'running' || !FX[name]) return;
    const now = performance.now();
    if (now - (last[name] || 0) < (GAP[name] || 30)) return;
    last[name] = now;
    try { FX[name](); } catch (e) { /* ignore */ }
  }

  return { init, play, set enabled(v) { enabled = v; }, get enabled() { return enabled; } };
})();

let hapticsOn = true;
let lastBuzz = 0;
function buzz(ms) {
  if (!hapticsOn || !navigator.vibrate) return;
  const now = performance.now();
  if (now - lastBuzz < 120) return;
  lastBuzz = now;
  try { navigator.vibrate(ms); } catch (e) { /* unsupported */ }
}

// Browsers only allow audio after a user gesture.
window.addEventListener('pointerdown', () => Sound.init(), { capture: true });
