// The whole house playing (roadmap MU4): a chip in the header while something plays
// anywhere ("Kitchen + Living room: Morning jazz"). A tap lists every room that plays,
// each with pause, and Pause all.

import { el } from '../util.js';
import { t } from '../i18n.js';
import { F, can, isPlaying, isTv, nowPlaying, groupOf, roomOfPlayer } from '../media.js';

// What plays now: one entry per group, [{ ids, rooms, title }].
export function playingNow(site, store) {
  const out = [];
  const seen = new Set();
  for (const id of site.index.media ?? []) {
    const s = store.get(id);
    if (seen.has(id) || !isPlaying(s) || isTv(s)) continue;
    const ids = (groupOf(s) ?? [id]).filter((m) => !seen.has(m));
    ids.forEach((m) => seen.add(m));
    const rooms = [...new Set(ids.map((m) => roomOfPlayer(site, m)?.name).filter(Boolean))];
    out.push({ ids, rooms, title: nowPlaying(s).title });
  }
  return out;
}

export function createPlayingChip({ site, store, adapter, signal }) {
  const label = el('span', { class: 'playing-text' });
  const btn = el('button', { class: 'chip chip-playing', type: 'button', hidden: true, 'aria-haspopup': 'true', 'aria-expanded': 'false', 'data-action': 'playing' },
    el('span', { class: 'playing-dot', 'aria-hidden': 'true' }), label);
  const list = el('ul', { class: 'playing-list' });
  const pauseAll = el('button', { class: 'chip chip-danger', type: 'button', 'data-action': 'pause-all' }, t('music.pauseAll'));
  const menu = el('div', { class: 'lights-menu playing-menu', role: 'menu', hidden: true }, list, pauseAll);
  const wrap = el('div', { class: 'lights-wrap playing-wrap' }, btn, menu);
  const pause = (ids) => {
    const players = ids.filter((id) => can(store.get(id), F.PAUSE));
    if (players.length) adapter.call('media_player', 'media_pause', { entity_id: players });
  };
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  pauseAll.addEventListener('click', () => { pause(playingNow(site, store).flatMap((g) => g.ids)); close(); });
  btn.addEventListener('click', () => {
    if (!menu.hidden) return close();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    menu.classList.remove('to-left');
    if (menu.getBoundingClientRect().right > document.documentElement.clientWidth - 8) menu.classList.add('to-left');
  });
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !wrap.contains(e.target)) close(); }, { signal });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) close(); }, { signal });
  const text = (g) => (g.title ? t('music.chip', { rooms: g.rooms.join(' + ') || '–', title: g.title }) : g.rooms.join(' + '));
  let unwatch = null;
  const refresh = () => {
    unwatch?.();
    unwatch = store.watch(site.index.media ?? [], () => {
      const now = playingNow(site, store);
      btn.hidden = !now.length;
      if (!now.length) { close(); return; }
      label.textContent = now.length === 1 ? text(now[0]) : t('music.chipMany', { n: now.length });
      btn.setAttribute('aria-label', `${t('music.nowPlaying')}: ${now.map(text).join('; ')}`);
      list.replaceChildren(...now.map((g) => el('li', {},
        el('span', {}, text(g)),
        el('button', { class: 'chip', type: 'button', 'aria-label': t('music.pauseIn', { rooms: g.rooms.join(' + ') }), onclick: () => pause(g.ids) }, t('music.pause')))));
    });
  };
  signal?.addEventListener('abort', () => unwatch?.());
  return { el: wrap, refresh };
}
