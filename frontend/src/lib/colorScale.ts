// Returns an RGB string: red (slow) → yellow (medium) → green (fast)
export function speedToColor(speed: number, maxSpeed = 200): string {
  const t = Math.min(Math.max(speed / maxSpeed, 0), 1);
  if (t >= 0.5) {
    // yellow → green
    const s = (t - 0.5) / 0.5;
    const r = Math.round(255 * (1 - s));
    return `rgb(${r},200,0)`;
  } else {
    // red → yellow
    const s = t / 0.5;
    const g = Math.round(200 * s);
    return `rgb(220,${g},0)`;
  }
}
