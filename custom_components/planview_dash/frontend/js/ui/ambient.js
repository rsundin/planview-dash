// The house as screensaver (roadmap W1): after the idle time in kiosk mode, the picture of
// the house fills the screen with a big clock, the outdoor temperature, the next calendar
// event, the warnings and what is playing. No buttons: a touch goes back to the dashboard.
// At night the dim (ui/wall.js) takes over. Light mode keeps it still (style.css).
//
// site.json:
//   "wall_screen": { "ambient": { "after": 300, "calendar": "calendar.family", "outdoor": "sensor.outdoor_temperature" } }
//
// "after" is in seconds and defaults to the idle time (idle.back_after). The outdoor
// temperature defaults to the dashboard's weather entity. "ambient": false, or no
// "ambient" at all, keeps it off.

import { el } from '../util.js';
import { t } from '../i18n.js';
import { playingNow } from './playing.js';

export const ambientCfg = (site) => {
  const a = site.wall_screen?.ambient;
  if (!a || a === false || a.enabled === false) return null;
  return a === true ? {} : a;
};

// Home Assistant's calendar entity carries its next (or current) event in its attributes:
// message, start_time and end_time as "2026-11-27 18:00:00" in local time, all_day.
const local = (s) => {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};
export function nextEvent(s, now = new Date()) {
  const a = s?.attributes;
  if (!a?.message || !s || s.state === 'unavailable') return null;
  const start = local(a.start_time);
  const end = local(a.end_time);
  if (!start) return null;
  if (end && end <= now) return null;
  return { title: String(a.message), start, end, allDay: !!a.all_day, now: start <= now, place: a.location ? String(a.location) : '' };
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "Now", "Today 18:00", "Tomorrow", "Fri 09:30".
export function whenText(ev, now, locale) {
  if (ev.now) return t('ambient.now');
  const time = ev.allDay ? '' : ev.start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const day = sameDay(ev.start, now) ? t('ambient.today') : sameDay(ev.start, tomorrow) ? t('ambient.tomorrow')
    : ev.start.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${day} ${time}` : day;
}

/**
 * The screensaver's text on top of the picture.
 * @param {object} o
 * @param {Function} o.warnings () => [{ level, text }]
 */
export function createAmbient({ site, store, warnings }) {
  const cfg = ambientCfg(site) ?? {};
  const clock = el('time', { class: 'ambient-clock' });
  const date = el('p', { class: 'ambient-date' });
  const temp = el('p', { class: 'ambient-temp' });
  const event = el('p', { class: 'ambient-event' });
  const playing = el('p', { class: 'ambient-playing' });
  const warn = el('ul', { class: 'ambient-warnings' });
  const box = el('div', { class: 'ambient-box' }, clock, date, temp, event, playing, warn);
  const node = el('div', { class: 'ambient', hidden: true, 'aria-hidden': 'true' }, box);
  const ids = () => [cfg.outdoor, cfg.calendar, site.weather, ...(site.index?.media ?? [])].filter(Boolean);

  function outdoor() {
    if (cfg.outdoor) {
      const s = store.get(cfg.outdoor);
      const v = Number(s?.state);
      if (!Number.isFinite(v)) return '';
      return `${Math.round(v * 10) / 10} ${s.attributes?.unit_of_measurement ?? site.tempUnit ?? '°C'}`;
    }
    const w = store.get(site.weather);
    const v = Number(w?.attributes?.temperature);
    if (!Number.isFinite(v)) return '';
    return `${Math.round(v * 10) / 10} ${w.attributes?.temperature_unit ?? site.tempUnit ?? '°C'}`;
  }

  function draw() {
    if (node.hidden) return;
    const now = new Date();
    clock.textContent = now.toLocaleTimeString(site.locale, { hour: '2-digit', minute: '2-digit' });
    clock.dateTime = now.toISOString();
    date.textContent = now.toLocaleDateString(site.locale, { weekday: 'long', day: 'numeric', month: 'long' });
    const out = outdoor();
    temp.textContent = out ? t('ambient.outdoor', { temp: out }) : '';
    temp.hidden = !out;
    const ev = cfg.calendar ? nextEvent(store.get(cfg.calendar), now) : null;
    event.textContent = ev ? `${whenText(ev, now, site.locale)} · ${ev.title}` : '';
    event.hidden = !ev;
    const now2 = playingNow(site, store);
    playing.textContent = now2.map((g) => (g.title ? `♪ ${g.rooms.join(' + ')}: ${g.title}` : `♪ ${g.rooms.join(' + ')}`)).join('   ');
    playing.hidden = !now2.length;
    const list = (warnings?.() ?? []).slice(0, 3);
    warn.replaceChildren(...list.map((w) => el('li', { 'data-level': w.level }, w.text)));
    warn.hidden = !list.length;
  }
  let unwatch = null;
  let timer = null;
  return {
    el: node,
    get shown() { return !node.hidden; },
    show() {
      if (!node.hidden) return;
      node.hidden = false;
      document.body.classList.add('is-ambient');
      draw();
      unwatch = store.watch(ids(), draw);
      timer = setInterval(draw, 15000);
    },
    hide() {
      if (node.hidden) return;
      node.hidden = true;
      document.body.classList.remove('is-ambient');
      unwatch?.();
      clearInterval(timer);
    },
    draw,
  };
}
