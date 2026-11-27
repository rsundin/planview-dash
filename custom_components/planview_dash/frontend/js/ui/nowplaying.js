// "Now playing" in the room panel: one row per speaker or TV in the room, the playing one
// first. Artwork, title and artist, previous, play/pause and next, volume and mute, the
// source, and a short list of favourites. A control is only drawn when the player says
// it can do it (supported_features).

import { el, sv } from '../util.js';
import { t } from '../i18n.js';
import { nameOf, noReading } from '../entities.js';
import { F, can, isPlaying, isTv, tvOn, nowPlaying, artUrl, volumeOf, roomPlayers } from '../media.js';
import { SPEAKER, TV } from '../views/speakers.js';

const icon = (d) => sv('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true' },
  sv('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
const ICON = {
  prev: 'M6 5v14M18 6l-9 6 9 6z',
  next: 'M18 5v14M6 6l9 6-9 6z',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  power: 'M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0',
  mute: 'M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6',
  sound: SPEAKER,
};

/**
 * @param {object} o
 * @param {object} o.room
 * @param {Function} o.watch  (ids, fn) => registers a store watch that ends with the panel
 * @param {object[]} [o.extra] (player id) => elements to add under a row (the music view's buttons)
 */
export function nowPlayingSection({ room, site, store, adapter, watch, extra = null }) {
  const list = el('ul', { class: 'np-list' });
  for (const p of roomPlayers(room, store)) list.append(playerRow(p.entity));
  return el('section', { class: 'psec np' }, el('h3', { class: 'eyebrow' }, t('music.nowPlaying')), list);

  function playerRow(id) {
    const call = (service, data = {}) => adapter.call('media_player', service, { entity_id: id, ...data });
    const art = el('img', { class: 'np-art', alt: '', hidden: true, decoding: 'async' });
    const artNone = el('span', { class: 'np-art np-art-none', 'aria-hidden': 'true' }, icon(SPEAKER));
    const name = el('span', { class: 'np-name' });
    const title = el('span', { class: 'np-title' });
    const by = el('span', { class: 'np-by muted small' });
    const btn = (key, label, fn) => el('button', { class: 'step np-btn', type: 'button', 'data-np': key, 'aria-label': label, title: label, onclick: fn }, icon(ICON[key]));
    const prev = btn('prev', t('music.previous'), () => call('media_previous_track'));
    const play = btn('play', t('music.play'), () => {
      const s = store.get(id);
      if (can(s, F.PAUSE) && can(s, F.PLAY)) call('media_play_pause');
      else call(isPlaying(s) ? (can(s, F.PAUSE) ? 'media_pause' : 'media_stop') : 'media_play');
    });
    const next = btn('next', t('music.next'), () => call('media_next_track'));
    const power = btn('power', t('music.power'), () => call(tvOn(store.get(id)) || isPlaying(store.get(id)) ? 'turn_off' : 'turn_on'));
    const mute = btn('mute', t('music.mute'), () => call('volume_mute', { is_volume_muted: !store.get(id)?.attributes?.is_volume_muted }));
    const volume = el('input', { type: 'range', min: 0, max: 100, class: 'np-volume' });
    volume.addEventListener('change', () => call('volume_set', { volume_level: Number(volume.value) / 100 })
      .then((ok) => { if (ok === false) { volume.blur(); draw(); } }));
    const source = el('select', { class: 'setup-input np-source' });
    source.addEventListener('change', () => { if (source.value) call('select_source', { source: source.value }); });
    const favBtn = el('button', { class: 'chip np-fav-btn', type: 'button', 'aria-expanded': 'false' }, t('music.favourites'));
    const favs = el('div', { class: 'np-favs', hidden: true });
    favBtn.addEventListener('click', () => toggleFavourites(id, favBtn, favs));
    const controls = el('div', { class: 'np-controls' }, power, prev, play, next);
    const volRow = el('div', { class: 'np-vol' }, mute, volume);
    const li = el('li', { class: 'np-row', 'data-entity': id },
      el('div', { class: 'np-top' }, art, artNone,
        el('div', { class: 'np-text' }, name, title, by)),
      controls, volRow,
      el('div', { class: 'np-more' }, source, favBtn), favs,
      ...(extra ? [].concat(extra(id) ?? []) : []));
    let lastArt = null;
    const draw = () => {
      const s = store.get(id);
      const label = nameOf(id, { store, site });
      name.textContent = label;
      li.classList.toggle('is-playing', isPlaying(s));
      li.classList.toggle('is-missing', !s);
      const dead = noReading(s) || !s;
      const np = nowPlaying(s);
      const tv = isTv(s);
      artNone.replaceChildren(icon(tv ? TV : SPEAKER));
      title.textContent = !s ? t('panel.missing') : dead ? t('status.unavailable')
        : np.title || t(isPlaying(s) ? 'music.playing' : s.state === 'paused' ? 'music.paused' : s.state === 'off' || s.state === 'standby' ? 'music.off' : 'music.idle');
      by.textContent = dead ? '' : np.by;
      const url = dead ? null : artUrl(s, adapter);
      if (url !== lastArt) {
        lastArt = url;
        art.hidden = !url;
        artNone.hidden = !!url;
        if (url) art.src = url; else art.removeAttribute('src');
      }
      // Only what this player can do.
      const playing = isPlaying(s);
      play.replaceChildren(icon(playing ? ICON.pause : ICON.play));
      play.setAttribute('aria-label', t(playing ? 'music.pause' : 'music.play'));
      play.title = play.getAttribute('aria-label');
      play.setAttribute('aria-pressed', String(playing));
      play.hidden = dead || !(can(s, F.PLAY) || can(s, F.PAUSE) || can(s, F.STOP));
      prev.hidden = dead || !can(s, F.PREVIOUS);
      next.hidden = dead || !can(s, F.NEXT);
      power.hidden = dead || !(tv ? can(s, F.TURN_OFF) || can(s, F.TURN_ON) : (s.state === 'off' && can(s, F.TURN_ON)));
      controls.hidden = [power, prev, play, next].every((b) => b.hidden);
      const vol = volumeOf(s);
      const muted = !!s?.attributes?.is_volume_muted;
      mute.hidden = dead || !can(s, F.VOLUME_MUTE);
      mute.replaceChildren(icon(muted ? ICON.mute : ICON.sound));
      mute.setAttribute('aria-pressed', String(muted));
      mute.setAttribute('aria-label', t(muted ? 'music.unmute' : 'music.mute', { name: label }));
      mute.title = mute.getAttribute('aria-label');
      volume.hidden = dead || !can(s, F.VOLUME_SET) || vol == null;
      volume.setAttribute('aria-label', t('music.volume', { name: label }));
      if (document.activeElement !== volume && vol != null) volume.value = String(Math.round(vol * 100));
      volRow.hidden = mute.hidden && volume.hidden;
      // Sources (inputs, apps, radio) where the player has them.
      const sources = Array.isArray(s?.attributes?.source_list) ? s.attributes.source_list.slice(0, 40) : [];
      source.hidden = dead || !can(s, F.SELECT_SOURCE) || !sources.length;
      source.setAttribute('aria-label', t('music.source', { name: label }));
      const current = s?.attributes?.source ?? '';
      const key = JSON.stringify([sources, current]);
      if (!source.hidden && source.dataset.key !== key) {
        source.dataset.key = key;
        source.replaceChildren(
          current && sources.includes(current) ? null : el('option', { value: '' }, t('music.sourcePick')),
          ...sources.map((x) => el('option', { value: x, selected: x === current }, x)));
      }
      favBtn.hidden = dead || !adapter.browse || !(can(s, F.BROWSE) && can(s, F.PLAY_MEDIA));
      source.parentNode.hidden = source.hidden && favBtn.hidden;
    };
    watch([id], draw);
    return li;
  }

  // A short list from the player's media browser: favourites, else radio, else playlists.
  async function toggleFavourites(id, btn, box) {
    if (!box.hidden) { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
    box.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    box.replaceChildren(el('p', { class: 'muted small' }, t('music.loading')));
    let items = [];
    try { items = await favourites(adapter, id); } catch (e) { console.warn('PlanView Dash: could not browse', id, e); }
    if (box.hidden) return;
    box.replaceChildren(...(items.length
      ? items.map((x) => el('button', { class: 'chip np-fav', type: 'button',
        onclick: () => adapter.call('media_player', 'play_media', { entity_id: id, media_content_id: x.media_content_id, media_content_type: x.media_content_type }) }, x.title))
      : [el('p', { class: 'muted small' }, t('music.noFavourites'))]));
  }
}

const FAVOURITE = /favou?rit|favorit/i;
const RADIO = /radio/i;
const PLAYLIST = /playlist|spellist/i;
export const FAVOURITES_MAX = 8;

// The first favourites, radio stations or playlists the player's browser offers.
export async function favourites(adapter, id) {
  const root = await adapter.browse(id);
  const kids = root?.children ?? [];
  const pick = [FAVOURITE, RADIO, PLAYLIST].map((re) => kids.find((k) => re.test(k.title ?? '') || re.test(k.media_content_id ?? ''))).find(Boolean);
  const from = pick ? (await adapter.browse(id, pick.media_content_id, pick.media_content_type))?.children ?? [] : kids;
  return from.filter((x) => x.can_play && x.media_content_id).slice(0, FAVOURITES_MAX);
}
