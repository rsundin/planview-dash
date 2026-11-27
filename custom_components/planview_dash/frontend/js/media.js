// Speakers and screens: media_player entities in their rooms, what they play, and the
// calls that control them.
//
// A room's players are the ones placed in it in site.json ("media": [{ "entity", "at" }])
// plus, for a room linked to a Home Assistant area, every media player in that area that
// is not placed elsewhere. Those show up by themselves and are never a reason to nag in
// placement mode: a speaker that is not placed is fine.
//
//   "music": { "enabled": false }            no speakers anywhere on the dashboard
//   "music": { "exclude": ["media_player.x"] }  players to leave out (a duplicate, a group)

import { num } from './util.js';

// Bits of supported_features (Home Assistant's MediaPlayerEntityFeature).
export const F = {
  PAUSE: 1, VOLUME_SET: 4, VOLUME_MUTE: 8, PREVIOUS: 16, NEXT: 32, TURN_ON: 128, TURN_OFF: 256,
  PLAY_MEDIA: 512, VOLUME_STEP: 1024, SELECT_SOURCE: 2048, STOP: 4096, PLAY: 16384, BROWSE: 131072, GROUPING: 524288,
};

export const musicOn = (site) => site.music?.enabled !== false;
export const isMedia = (id) => typeof id === 'string' && id.startsWith('media_player.');
export const can = (s, bit) => ((Number(s?.attributes?.supported_features) || 0) & bit) === bit;
export const isPlaying = (s) => s?.state === 'playing';
export const isPaused = (s) => s?.state === 'paused';
export const isTv = (s) => s?.attributes?.device_class === 'tv';
// A TV that is on (playing, paused, idle or just on) glows like a lamp.
export const tvOn = (s) => isTv(s) && !!s && !['off', 'standby', 'unavailable', 'unknown'].includes(s.state);
// Something to show in "Now playing": a title, or at least a state that is not off.
export const isActive = (s) => isPlaying(s) || isPaused(s);
export const volumeOf = (s) => { const v = num(s?.attributes?.volume_level); return v == null ? null : Math.min(1, Math.max(0, v)); };

// "Title", "Artist" (or the album, the channel, the app) for a player.
export function nowPlaying(s) {
  const a = s?.attributes ?? {};
  const title = a.media_title || a.media_channel || a.app_name || a.source || '';
  const by = a.media_artist || a.media_album_artist || a.media_series_title || (a.media_title ? a.app_name : '') || '';
  return { title, by: by === title ? '' : by };
}

// The album art's address. Only Home Assistant's own proxy (entity_picture_local, or a
// path on Home Assistant) is used: the dashboard never fetches anything from outside.
export function artPath(s) {
  const a = s?.attributes ?? {};
  const p = a.entity_picture_local || a.entity_picture;
  if (typeof p !== 'string') return null;
  if (p.startsWith('/') || p.startsWith('data:image/')) return p;
  return null;
}
export const artUrl = (s, adapter) => {
  const p = artPath(s);
  return !p ? null : p.startsWith('data:') ? p : adapter?.url ? adapter.url(p) : p;
};

// Group members as Home Assistant lists them; the first one leads the group.
export function groupOf(s) {
  const m = s?.attributes?.group_members;
  return Array.isArray(m) && m.length > 1 ? m : null;
}

// Every player a room shows, playing ones first: [{ entity, at?, auto? }].
export const roomPlayers = (room, store) => {
  const list = room.media ?? [];
  const rank = (p) => (isPlaying(store.get(p.entity)) ? 0 : isActive(store.get(p.entity)) || tvOn(store.get(p.entity)) ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b));
};

// The player a tap on a room plays or pauses: the one playing, else the first that can play.
export function mainPlayer(room, store) {
  const list = roomPlayers(room, store).filter((p) => !isTv(store.get(p.entity)) || isActive(store.get(p.entity)));
  return list[0]?.entity ?? room.media?.[0]?.entity ?? null;
}

// Media players placed anywhere in a raw site config.
export function placedMedia(cfg) {
  const ids = new Set();
  for (const plan of cfg.floorplans ?? []) for (const room of plan.rooms ?? []) for (const m of room.media ?? []) if (m?.entity) ids.add(m.entity);
  return ids;
}

// Gives every room its players: placed ones from site.json, then the area's other players.
// Registry-hidden and diagnostic players and the excluded ones are left out.
export function assignMedia(site, store) {
  const all = new Set();
  if (!musicOn(site)) {
    for (const room of site.index.rooms.values()) room.media = [];
    site.index.media = [];
    return [];
  }
  const skip = new Set(site.music?.exclude ?? []);
  const used = placedMedia(site);
  const areas = site.areas;
  const hidden = (id) => { const r = areas?.entityReg?.get(id); return !!(r && (r.hidden_by || r.hidden || r.entity_category)); };
  const byArea = new Map();
  if (areas?.entityArea?.size) {
    for (const s of store.all()) {
      const id = s.entity_id;
      if (!isMedia(id) || used.has(id) || skip.has(id) || hidden(id)) continue;
      const area = areas.entityArea.get(id);
      if (!area) continue;
      if (!byArea.has(area)) byArea.set(area, []);
      byArea.get(area).push(id);
    }
  }
  const auto = [];
  for (const room of site.index.rooms.values()) {
    room.media = (room.media ?? []).filter((m) => m?.entity && !skip.has(m.entity));
    if (room.ha_area && !room.device) {
      for (const id of (byArea.get(room.ha_area) ?? []).sort()) {
        if (room.media.some((m) => m.entity === id)) continue;
        room.media.push({ entity: id, auto: true });
        auto.push(id);
      }
    }
    for (const m of room.media) all.add(m.entity);
  }
  site.index.media = [...all];
  return auto;
}

// The room a player is in.
export const roomOfPlayer = (site, id) => [...site.index.rooms.values()].find((r) => (r.media ?? []).some((m) => m.entity === id)) ?? null;

// The average colour of the album art, for the room's pulse: [r, g, b] or null.
// Read from a small canvas; a picture the browser will not let us read gives null.
const artColours = new Map();
export function artColour(url) {
  if (!url) return Promise.resolve(null);
  if (artColours.has(url)) return artColours.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 8;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, 8, 8);
        const d = g.getImageData(0, 0, 8, 8).data;
        let r = 0, gr = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          // Near-black and near-white pixels say little about the colour of the art.
          const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (d[i + 3] < 128 || lum < 24 || lum > 236) continue;
          r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++;
        }
        resolve(n ? brighten([r / n, gr / n, b / n]) : null);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  if (artColours.size > 40) artColours.clear();
  artColours.set(url, p);
  return p;
}

// A colour bright and saturated enough to glow on a dark plan.
function brighten([r, g, b]) {
  const max = Math.max(r, g, b, 1);
  const k = 220 / max;
  const mean = (r + g + b) / 3;
  return [r, g, b].map((v) => Math.round(Math.min(255, (mean + (v - mean) * 1.4) * k)));
}

// Volumes of a group scaled together: the loudest member gets `level`, the others keep
// their share of it. Members at zero follow at the main level.
export function scaledVolumes(levels, level) {
  const top = Math.max(...levels.map((v) => v ?? 0));
  return levels.map((v) => {
    const x = top > 0 && v != null ? (v / top) * level : level;
    return Math.round(Math.min(1, Math.max(0, x)) * 100) / 100;
  });
}
