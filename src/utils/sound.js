let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(frequency, startTime, durationMs, type = 'sine', gainValue = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const durationSec = durationMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.01);
  gain.gain.setValueAtTime(gainValue, startTime + durationSec - 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + durationSec);
}

export function playSuccess() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  // ascending two-tone beep: 440Hz 100ms then 660Hz 100ms
  playTone(440, now, 100);
  playTone(660, now + 0.1, 100);
}

export function playWarning() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  // single mid-tone beep: 520Hz 200ms
  playTone(520, now, 200);
}

export function playError() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  // descending two-tone: 440Hz 100ms then 330Hz 100ms
  playTone(440, now, 100);
  playTone(330, now + 0.1, 100);
}
