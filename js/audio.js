// WarBreach — synthesized sound effects (Web Audio, no files) and phone vibration.
'use strict';

const Sound = (() => {
  let ac = null, master = null, noiseBuf = null, keepAlive = null, primed = false;
  const last = {};
  let enabled = true;

  // A tiny silent WAV. Playing it through an <audio> element switches iPhones to the
  // "playback" audio session, so game sounds are heard even with the ring/silent switch on.
  function silentWav() {
    const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  // Must run inside a tap: browsers (iPhone Safari above all) only start audio from a user gesture.
  function unlock() {
    if (!enabled) return;
    init();
    if (!ac) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    if (ac.state !== 'running') { try { ac.resume(); } catch (e) { /* ignore */ } }
    if (!primed) {
      try {
        const b = ac.createBuffer(1, 1, 22050), src = ac.createBufferSource();
        src.buffer = b; src.connect(ac.destination); src.start(0);
        primed = true;
      } catch (e) { /* ignore */ }
    }
    if (!keepAlive) {
      try {
        keepAlive = new Audio(silentWav());
        keepAlive.loop = true;
        keepAlive.setAttribute('playsinline', '');
        keepAlive.volume = 0.01;
      } catch (e) { keepAlive = null; }
    }
    if (keepAlive && keepAlive.paused) { const p = keepAlive.play(); if (p && p.catch) p.catch(() => {}); }
  }

  function init() {
    if (ac) return;
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
    zap:     () => { noise(0.18, 'highpass', 3000, 0.25); tone(1800, 0.12, 'sawtooth', 0.05, 400); },
    medal:   () => { tone(1046, 0.1, 'triangle', 0.12); tone(1568, 0.25, 'triangle', 0.12, null, 0.1); },
  };
  // minimum ms between repeats so rapid fire doesn't stack into noise
  const GAP = { mg: 70, rifle: 90, flame: 120, boom: 60, rocket: 80, collect: 60, mortar: 100, cannon: 60, zap: 90 };

  function play(name) {
    if (!enabled || !ac || !FX[name]) return;
    if (ac.state !== 'running') { try { ac.resume(); } catch (e) { /* ignore */ } if (ac.state !== 'running') return; }
    const now = performance.now();
    if (now - (last[name] || 0) < (GAP[name] || 30)) return;
    last[name] = now;
    try { FX[name](); } catch (e) { /* ignore */ }
  }

  function setEnabled(v) {
    enabled = v;
    if (!v && keepAlive) keepAlive.pause();
  }

  return { unlock, play, set enabled(v) { setEnabled(v); }, get enabled() { return enabled; } };
})();

let hapticsOn = true;
let lastBuzz = 0;
let tickLabel = null;

// iPhones have no vibration API. Safari 18+ gives a haptic tick when a "switch"
// checkbox is toggled, so tapping a hidden one is the closest thing available.
function iosTick() {
  try {
    if (!tickLabel) {
      tickLabel = document.createElement('label');
      tickLabel.setAttribute('aria-hidden', 'true');
      tickLabel.style.cssText = 'position:fixed;left:-50px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      tickLabel.appendChild(input);
      document.body.appendChild(tickLabel);
    }
    tickLabel.click();
  } catch (e) { /* unsupported */ }
}

const canVibrate = typeof navigator.vibrate === 'function';

function buzz(ms) {
  if (!hapticsOn) return;
  const now = performance.now();
  if (now - lastBuzz < 120) return;
  lastBuzz = now;
  if (canVibrate) {
    try { navigator.vibrate(Array.isArray(ms) ? ms : Math.max(20, ms)); } catch (e) { /* blocked */ }
  } else {
    iosTick();
    if (Array.isArray(ms)) for (let i = 2; i < Math.min(ms.length, 5); i += 2) setTimeout(iosTick, ms.slice(0, i).reduce((a, b) => a + b, 0));
  }
}

// Unlock audio on every kind of tap; iPhones only count touchend/click as a real gesture.
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, () => Sound.unlock(), { capture: true, passive: true });
}
