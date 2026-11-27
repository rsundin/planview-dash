// The music view (roadmap MU3): a Music switch on the floor plan. Rooms with a speaker
// show a volume ring and what plays; silent rooms dim. A tap plays or pauses there, a long
// press opens the room panel. "+" (or a drag from a playing room) joins a room to the
// music, "−" takes it out; with "Move" chosen, a drag moves the music instead. Rooms in
// one group share an outline colour, and the bar below sets the group's volume, all
// together or room by room. Only Home Assistant's own actions are used; with Music
// Assistant, moving uses its transfer_queue.

import { el, sv, pts, centroid, bbox, svgPoint, press } from '../util.js';
import { t } from '../i18n.js';
import { nameOf } from '../entities.js';
import { F, can, isPlaying, isActive, isTv, nowPlaying, volumeOf, groupOf, mainPlayer, roomOfPlayer, scaledVolumes } from '../media.js';

const GROUP_COLOURS = ['#c9a2ff', '#6fe3a5', '#ffcf4a', '#8cc4ff', '#ff9fb2'];

// A player that can join others and be joined: grouping support, not a TV.
const groupable = (s) => !!s && can(s, F.GROUPING) && !isTv(s);

/**
 * One controller for the whole dashboard: the switch, the bar, the layer on each plan,
 * and the buttons the room panel adds under a player.
 */
export function createMusic({ site, store, adapter, onChange = () => {} }) {
  let on = false;
  let mode = 'join'; // what a drag does: 'join' or 'move'
  let focus = null; // the player whose group the bar shows
  const platform = (id) => site.areas?.entityReg?.get(id)?.platform ?? null;
  const assistant = (...ids) => ids.some((id) => platform(id) === 'music_assistant');
  const call = (service, data) => adapter.call('media_player', service, data);
  const name = (id) => nameOf(id, { store, site });
  const roomName = (id) => roomOfPlayer(site, id)?.name ?? name(id);

  // Groups now: lists of player ids, the leader first. A playing player outside any group
  // is a group of one.
  function groups() {
    const out = [];
    const seen = new Set();
    for (const id of site.index.media ?? []) {
      if (seen.has(id)) continue;
      const s = store.get(id);
      const members = groupOf(s);
      if (members) { members.forEach((m) => seen.add(m)); out.push(members.filter((m) => site.index.media.includes(m) || store.get(m))); }
      else if (isPlaying(s)) { seen.add(id); out.push([id]); }
    }
    return out;
  }
  const groupFor = (id) => groups().find((g) => g.includes(id)) ?? null;
  const colourFor = (id) => { const i = groups().findIndex((g) => g.length > 1 && g.includes(id)); return i < 0 ? null : GROUP_COLOURS[i % GROUP_COLOURS.length]; };
  // The music a room would join: the group the bar shows, else the first that plays.
  function leader(except = null) {
    const playing = groups().filter((g) => g.some((id) => isPlaying(store.get(id))) && !g.includes(except));
    const pick = (focus && playing.find((g) => g.includes(focus))) ?? playing[0];
    return pick?.[0] ?? null;
  }

  // ---------- the actions
  function playPause(room) {
    const id = mainPlayer(room, store);
    if (!id) return;
    focus = id;
    const s = store.get(id);
    if (can(s, F.PAUSE) && can(s, F.PLAY)) call('media_play_pause', { entity_id: id });
    else call(isPlaying(s) ? 'media_pause' : 'media_play', { entity_id: id });
  }
  function canJoin(room) {
    const id = joinable(room);
    const lead = leader(id);
    return !!id && !!lead && groupable(store.get(lead)) && !groupFor(lead)?.includes(id);
  }
  const joinable = (room) => (room.media ?? []).map((m) => m.entity).find((id) => groupable(store.get(id))) ?? null;
  function join(room, from = leader()) {
    const id = joinable(room);
    if (!id || !from || id === from) return;
    focus = from;
    call('join', { entity_id: from, group_members: [id] });
  }
  function leave(room) {
    const id = (room.media ?? []).map((m) => m.entity).find((x) => (groupFor(x)?.length ?? 0) > 1);
    if (id) call('unjoin', { entity_id: id });
  }
  const inGroup = (room) => (room.media ?? []).some((m) => (groupFor(m.entity)?.length ?? 0) > 1);
  // Moving: Music Assistant moves the queue; otherwise join the new room and let the old go.
  function canMove(fromId, room) {
    const to = joinable(room) ?? mainPlayer(room, store);
    if (!fromId || !to || to === fromId) return false;
    return assistant(fromId, to) || (groupable(store.get(fromId)) && groupable(store.get(to)));
  }
  async function move(fromId, room) {
    const to = joinable(room) ?? mainPlayer(room, store);
    if (!canMove(fromId, room)) return;
    focus = to;
    if (assistant(fromId, to)) {
      await adapter.call('music_assistant', 'transfer_queue', { entity_id: to, source_player: fromId });
      return;
    }
    const ok = await call('join', { entity_id: fromId, group_members: [to] });
    if (ok !== false) await call('unjoin', { entity_id: fromId });
  }

  // ---------- the switch and the bar
  const toggle = el('button', { class: 'chip music-toggle', type: 'button', hidden: true, 'aria-pressed': 'false',
    onclick: () => setOn(!on) }, t('music.view'));
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': t('music.dragDoes') });
  const vol = el('input', { type: 'range', min: 0, max: 100, class: 'music-main-vol', 'aria-label': t('music.groupVolume') });
  const members = el('ul', { class: 'music-members' });
  const groupLabel = el('p', { class: 'small music-group-name' });
  const bar = el('div', { class: 'music-bar', hidden: true, role: 'region', 'aria-label': t('music.view') },
    el('div', { class: 'music-bar-row' }, el('span', { class: 'small muted' }, t('music.dragDoes')), seg),
    groupLabel,
    el('div', { class: 'music-bar-row' }, vol),
    members);
  const renderSeg = () => seg.replaceChildren(...[['join', t('music.modeJoin')], ['move', t('music.modeMove')]].map(([k, label]) =>
    el('button', { type: 'button', class: k === mode ? 'is-active' : null, 'aria-pressed': String(k === mode), 'data-mode': k,
      onclick: () => { mode = k; renderSeg(); } }, label)));
  renderSeg();
  vol.addEventListener('change', () => {
    const g = shownGroup();
    if (!g) return;
    const levels = scaledVolumes(g.map((id) => volumeOf(store.get(id))), Number(vol.value) / 100);
    g.forEach((id, i) => { if (can(store.get(id), F.VOLUME_SET)) call('volume_set', { entity_id: id, volume_level: levels[i] }); });
  });
  const shownGroup = () => { const lead = leader(); return lead ? groupFor(lead) : null; };
  function drawBar() {
    const g = shownGroup();
    bar.hidden = !on;
    if (!on) return;
    if (!g) { groupLabel.textContent = t('music.nothing'); vol.hidden = true; members.replaceChildren(); return; }
    const np = nowPlaying(store.get(g[0]));
    groupLabel.textContent = t('music.groupNow', { rooms: g.map(roomName).join(' + '), title: np.title || t('music.playing') });
    const levels = g.map((id) => volumeOf(store.get(id))).filter((v) => v != null);
    vol.hidden = !levels.length;
    if (document.activeElement !== vol && levels.length) vol.value = String(Math.round(Math.max(...levels) * 100));
    // Plus and minus per room, as a step of five.
    members.replaceChildren(...g.map((id) => {
      const s = store.get(id);
      const v = volumeOf(s);
      // Read the level at the tap: the list may not have redrawn since the last change.
      const step = (d) => {
        const now = store.get(id);
        const level = volumeOf(now);
        if (can(now, F.VOLUME_SET) && level != null) call('volume_set', { entity_id: id, volume_level: Math.round(Math.min(1, Math.max(0, level + d)) * 100) / 100 });
        else if (can(now, F.VOLUME_STEP)) call(d > 0 ? 'volume_up' : 'volume_down', { entity_id: id });
      };
      return el('li', { 'data-entity': id },
        el('span', {}, roomName(id)),
        el('span', { class: 'mono small' }, v == null ? '' : `${Math.round(v * 100)} %`),
        el('button', { class: 'step', type: 'button', 'aria-label': t('music.quieter', { name: roomName(id) }), onclick: () => step(-0.05) }, '−'),
        el('button', { class: 'step', type: 'button', 'aria-label': t('music.louder', { name: roomName(id) }), onclick: () => step(0.05) }, '+'));
    }));
  }
  const layers = new Set();
  function setOn(next) {
    on = !!next;
    toggle.setAttribute('aria-pressed', String(on));
    toggle.classList.toggle('is-active', on);
    document.querySelector('.stage')?.classList.toggle('is-music', on);
    drawBar();
    layers.forEach((l) => l.draw());
    onChange(on);
  }
  store.watch(null, () => { if (on) { drawBar(); } });

  // ---------- one floor plan's layer
  function layer({ rooms, unit, onRoom }) {
    const g = sv('g', { class: 'fp-music' });
    const items = [];
    for (const room of rooms) {
      if (!room.area || room.hidden) continue;
      if (!(room.media ?? []).length) { g.append(sv('polygon', { class: 'fp-music-dim', points: pts(room.area) })); continue; }
      const [cx, cy] = room.label ?? centroid(room.area);
      const b = bbox([room.area]);
      const r = Math.min(unit * 2.2, Math.min(b.w, b.h) * 0.22);
      const outline = sv('polygon', { class: 'fp-music-room', points: pts(room.area), 'data-music-room': room.id, tabindex: 0, role: 'button', 'stroke-width': unit * 0.3 });
      const track = sv('circle', { class: 'fp-music-track', cx, cy, r, 'stroke-width': unit * 0.35 });
      const ring = sv('circle', { class: 'fp-music-ring', cx, cy, r, 'stroke-width': unit * 0.35, pathLength: 100, transform: `rotate(-90 ${cx} ${cy})` });
      const playIcon = sv('path', { class: 'fp-music-icon', transform: `translate(${cx - r * 0.5} ${cy - r * 0.5}) scale(${r / 24})` });
      const title = sv('text', { class: 'fp-music-title', x: cx, y: cy + r + unit * 1.2, 'font-size': unit * 0.85, 'text-anchor': 'middle' });
      const btn = (cls, label, x, fn) => {
        const n = sv('g', { class: `fp-music-btn ${cls}`, tabindex: 0, role: 'button', 'aria-label': label },
          sv('circle', { cx: x, cy: cy - r - unit * 0.6, r: unit * 0.9 }),
          sv('text', { x, y: cy - r - unit * 0.6 + unit * 0.38, 'font-size': unit * 1.3, 'text-anchor': 'middle' }, cls === 'is-join' ? '+' : '−'));
        n.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        n.addEventListener('pointerdown', (e) => e.stopPropagation());
        n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fn(); } });
        return n;
      };
      const plus = btn('is-join', t('music.joinRoom', { room: room.name }), cx + r, () => join(room));
      const minus = btn('is-leave', t('music.leaveRoom', { room: room.name }), cx - r, () => leave(room));
      press(outline, () => { if (!dragged) playPause(room); }, () => { if (!dragged) onRoom(room); });
      g.append(outline, track, ring, playIcon, title, plus, minus);
      const ids = room.media.map((m) => m.entity);
      const draw = () => {
        const id = mainPlayer(room, store);
        const s = store.get(id);
        const playing = isPlaying(s);
        const v = volumeOf(s);
        const colour = ids.map(colourFor).find(Boolean);
        outline.classList.toggle('is-playing', playing);
        outline.classList.toggle('is-silent', !isActive(s) && !playing);
        if (colour) outline.style.setProperty('--group', colour); else outline.style.removeProperty('--group');
        outline.classList.toggle('in-group', !!colour);
        ring.setAttribute('stroke-dasharray', `${Math.round((v ?? 0) * 100)} 100`);
        ring.classList.toggle('is-playing', playing);
        playIcon.setAttribute('d', playing ? 'M8 5v14M16 5v14' : 'M7 5l12 7-12 7z');
        const np = nowPlaying(s);
        title.textContent = playing || isActive(s) ? np.title : '';
        plus.style.display = on && canJoin(room) ? '' : 'none';
        minus.style.display = on && inGroup(room) ? '' : 'none';
        outline.setAttribute('aria-label', [room.name, playing ? t('music.playingTitle', { title: np.title || t('music.playing') }) : t('music.idle'),
          v != null ? t('music.volumePct', { n: Math.round(v * 100) }) : null].filter(Boolean).join(', '));
      };
      items.push({ room, outline, draw, ids });
      store.watch(null, draw);
    }

    // A drag from a playing room to another: join (or move) the music there.
    let drag = null, dragged = false;
    const line = sv('line', { class: 'fp-music-drag', 'stroke-width': unit * 0.35 });
    line.style.display = 'none';
    g.append(line);
    function attach(svg) {
      g.addEventListener('pointerdown', (e) => {
        const node = e.target.closest?.('[data-music-room]');
        const item = node && items.find((x) => x.outline === node);
        const from = item && mainPlayer(item.room, store);
        if (!from || !isPlaying(store.get(from))) return;
        const p = svgPoint(svg, e);
        drag = { item, from, start: [e.clientX, e.clientY], p, id: e.pointerId, moved: false };
      });
      svg.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 10) return;
        drag.moved = true;
        const p = svgPoint(svg, e);
        Object.entries({ x1: drag.p.x, y1: drag.p.y, x2: p.x, y2: p.y }).forEach(([k, v]) => line.setAttribute(k, v));
        line.style.display = '';
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag;
        drag = null;
        line.style.display = 'none';
        if (!d.moved) return;
        dragged = true;
        setTimeout(() => { dragged = false; }, 0);
        const node = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-music-room]');
        const target = node && items.find((x) => x.outline === node);
        if (!target || target === d.item) return;
        if (mode === 'move') move(d.from, target.room); else join(target.room, d.from);
      };
      svg.addEventListener('pointerup', end);
      svg.addEventListener('pointercancel', () => { drag = null; line.style.display = 'none'; });
    }
    const l = { draw: () => items.forEach((x) => x.draw()) };
    layers.add(l);
    return { el: g, attach, hasMusic: items.length > 0 };
  }

  // Under a player in the room panel: play here too, move here, and leave the group.
  function panelExtra(room) {
    return (id) => {
      const s = store.get(id);
      const lead = leader(id);
      const out = [];
      if (lead && groupable(s) && groupable(store.get(lead)) && !groupFor(lead)?.includes(id)) {
        out.push(el('button', { class: 'chip', type: 'button', 'data-action': 'music-join', onclick: () => join(room, lead) }, t('music.playHereToo', { from: roomName(lead) })));
      }
      if (lead && !isPlaying(s) && canMove(lead, room)) {
        out.push(el('button', { class: 'chip', type: 'button', 'data-action': 'music-move', onclick: () => move(lead, room) }, t('music.moveHere', { from: roomName(lead) })));
      }
      if ((groupFor(id)?.length ?? 0) > 1) {
        out.push(el('button', { class: 'chip', type: 'button', 'data-action': 'music-leave', onclick: () => call('unjoin', { entity_id: id }) }, t('music.leave')));
      }
      return out.length ? el('div', { class: 'np-group row' }, out) : null;
    };
  }

  return {
    toggle, bar, layer, panelExtra, setOn, get on() { return on; },
    // Shown when the plan has rooms with speakers.
    show(visible) { toggle.hidden = !visible; if (!visible && on) setOn(false); },
    groups, leader, join, leave, move, playPause,
  };
}
