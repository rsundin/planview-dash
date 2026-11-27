// Warm up before arrival: how fast the house heats, and when heating must start to reach
// a temperature by a time. Pure functions, no DOM: the browser tests import them in Node.

// Degrees per hour when history says nothing useful (a new sensor, a house never heated
// from cold): a slow house, so the estimate errs on the early side.
export const DEFAULT_RATE = 0.8;

// How fast the room has warmed when it was heated: the median slope of the rises in the
// history that last at least `minMinutes` and climb at least `minRise` degrees.
// points: [{ t: ms, v: degrees }] in time order. Returns degrees per hour, or null.
export function heatingRate(points, { minRise = 0.5, minMinutes = 40, dip = 0.15 } = {}) {
  const pts = (points ?? []).filter((p) => Number.isFinite(p?.t) && Number.isFinite(p?.v));
  const slopes = [];
  let start = 0, top = 0;
  const close = (end) => {
    const a = pts[start], b = pts[top];
    if (!a || !b || end <= start) return;
    const hours = (b.t - a.t) / 3600e3;
    const rise = b.v - a.v;
    if (rise >= minRise && hours * 60 >= minMinutes) slopes.push(rise / hours);
  };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].v >= pts[top].v) { top = i; continue; }
    // A small dip (sensor noise, a door opened) does not end a rise; a real fall does.
    if (pts[top].v - pts[i].v > dip) { close(i); start = i; top = i; }
  }
  close(pts.length);
  if (!slopes.length) return null;
  slopes.sort((x, y) => x - y);
  const mid = Math.floor(slopes.length / 2);
  return slopes.length % 2 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2;
}

// When heating must start to reach `target` by `arrive` from `current`, at `rate` degrees
// an hour, with a margin for the last degree being the slowest.
//   { start: Date, hours, late: true when it should already have started, ready: already warm }
export function warmUpStart({ current, target, arrive, rate = DEFAULT_RATE, now = Date.now(), margin = 0.2 }) {
  const at = arrive instanceof Date ? arrive.getTime() : Number(arrive);
  if (!Number.isFinite(current) || !Number.isFinite(target) || !Number.isFinite(at)) return null;
  if (current >= target) return { start: new Date(Math.max(now, at)), hours: 0, late: false, ready: true };
  const r = rate > 0 ? rate : DEFAULT_RATE;
  const hours = ((target - current) / r) * (1 + margin);
  // Rounded down to five minutes: a start time people can read and trust.
  const raw = at - hours * 3600e3;
  const start = Math.floor(raw / 300e3) * 300e3;
  return { start: new Date(Math.max(now, start)), hours, late: start < now, ready: false };
}
