// Speakers and TVs on a floor plan: an icon where the player is placed (or in the room's
// corner), a soft pulse over the room while it plays, tinted from the album art, and a
// glow round a TV that is on. Light mode keeps the pulse still (style.css).

import { sv, pts, bbox, press, stripOf } from '../util.js';
import { t } from '../i18n.js';
import { nameOf, noReading } from '../entities.js';
import { isPlaying, isTv, tvOn, artUrl, artColour, nowPlaying } from '../media.js';

export const SPEAKER = 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11';
export const TV = 'M3 5h18v12H3zM8 21h8M12 17v4';

// Where a player without a place of its own goes: a row from the room's corner that is
// farthest from its lamps and LED strips, so the icon never covers one.
export function cornerSpot(room, i, unit) {
  const b = bbox([room.area]);
  const step = unit * 2.2;
  const inset = unit * 1.6;
  const marks = room.lights.flatMap((l) => [l.at, ...(stripOf(l)?.points ?? [])]).filter(Array.isArray);
  const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => ({
    dx, dy, x: dx > 0 ? b.x + inset : b.x + b.w - inset, y: dy > 0 ? b.y + inset : b.y + b.h - inset,
  }));
  const clear = (c) => (marks.length ? Math.min(...marks.map(([x, y]) => Math.hypot(x - c.x, y - c.y))) : Infinity);
  const c = corners.reduce((best, x) => (clear(x) > clear(best) + 1e-6 ? x : best), corners[0]);
  const perRow = Math.max(1, Math.floor((b.w - unit * 2) / step));
  return [c.x + c.dx * (i % perRow) * step, c.y + c.dy * Math.floor(i / perRow) * step];
}

/**
 * Builds the speaker layers of one floor plan.
 * @returns {{ pulses: SVGGElement, marks: SVGGElement }}
 */
export function createSpeakers({ site, rooms, store, adapter, unit, onRoom }) {
  const pulses = sv('g', { class: 'fp-music-pulses' });
  const marks = sv('g', { class: 'fp-speakers' });
  pulses.style.pointerEvents = 'none';
  for (const room of rooms) {
    const players = room.media ?? [];
    if (!players.length || !room.area) continue;
    const pulse = sv('polygon', { class: 'fp-music-pulse', points: pts(room.area) });
    pulses.append(pulse);
    let corner = 0;
    const ids = players.map((p) => p.entity);
    for (const p of players) {
      const [x, y] = Array.isArray(p.at) ? p.at : cornerSpot(room, corner++, unit);
      const r = unit * 0.85;
      const halo = sv('circle', { class: 'fp-tv-glow', cx: x, cy: y, r: unit * 3.2 });
      halo.style.pointerEvents = 'none';
      pulses.append(halo);
      const icon = sv('path', { class: 'fp-speaker-icon', d: SPEAKER, transform: `translate(${x - r * 0.62} ${y - r * 0.62}) scale(${(r * 1.24) / 24})` });
      const mark = sv('g', { class: 'fp-speaker', 'data-drag': 'media', 'data-entity': p.entity, tabindex: 0, role: 'button' },
        sv('circle', { class: 'fp-speaker-hit', cx: x, cy: y, r: unit * 1.2 }),
        sv('circle', { class: 'fp-speaker-dot', cx: x, cy: y, r, 'stroke-width': unit * 0.12 }),
        icon,
        sv('title', {}));
      press(mark, () => onRoom(room), () => onRoom(room));
      marks.append(mark);
      store.watch([p.entity], () => {
        const s = store.get(p.entity);
        const tv = isTv(s);
        icon.setAttribute('d', tv ? TV : SPEAKER);
        const playing = isPlaying(s);
        const on = playing || tvOn(s);
        mark.classList.toggle('is-on', on);
        mark.classList.toggle('is-tv', tv);
        mark.classList.toggle('is-missing', !s);
        mark.classList.toggle('is-silent', noReading(s));
        halo.classList.toggle('is-on', tvOn(s));
        const name = nameOf(p.entity, { store, site });
        const np = playing ? nowPlaying(s) : null;
        const label = np?.title ? t('music.playingIn', { name, title: np.title }) : name;
        mark.setAttribute('aria-label', label);
        mark.lastChild.textContent = label;
      });
    }
    // The room pulses while any of its speakers plays, in the colour of its album art.
    let lastArt = null;
    store.watch(ids, () => {
      const playing = ids.map((id) => store.get(id)).find((s) => isPlaying(s) && !isTv(s));
      pulse.classList.toggle('is-on', !!playing);
      const url = playing ? artUrl(playing, adapter) : null;
      if (url === lastArt) return;
      lastArt = url;
      if (!url) { pulse.style.removeProperty('--music'); return; }
      artColour(url).then((c) => {
        if (lastArt !== url) return;
        if (c) pulse.style.setProperty('--music', `rgb(${c.join(' ')})`);
        else pulse.style.removeProperty('--music');
      });
    });
  }
  return { pulses, marks };
}
