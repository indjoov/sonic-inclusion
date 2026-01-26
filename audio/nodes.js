export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function createGain(ctx, value = 1) {
  const g = ctx.createGain();
  g.gain.value = clamp01(value);
  return g;
}

export function setGainSmooth(param, value, now, ramp = 0.02) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(clamp01(value), now + ramp);
}
