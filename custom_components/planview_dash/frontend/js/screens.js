// Screen profiles: what one wall screen or tablet shows, and what a guest may do there.
//
//   "screens": [
//     { "id": "hall", "name": "Hall", "start": "plan:house", "back_after": 60 },
//     { "id": "guest", "name": "Guest room", "start": "room:bedroom_2", "guest": true, "hide_rooms": ["office"] }
//   ]
//
// A device picks its profile with ?screen=<id> on the address (?screen=none clears it), or
// on the wall screen sheet; the choice is kept on the device, per dashboard.
//
// start       "overview", "plan:<id>" or "room:<id>": where the screen starts and goes back to
// back_after  seconds without touch before going back there (wall_screen.idle.back_after otherwise)
// guest       guest mode: no placement mode, setup guide, connection or problem report, no
//             cameras or goodnight, and locks, alarms, garage doors and gates stay read-only
// hide_rooms  rooms this screen does not show

import { storage } from './util.js';

export const screenKey = (site) => `pvd:${site.id}:screen`;

// Query parameters of the page the user sees: in the Home Assistant panel that is the
// window around this frame.
function pageParams() {
  try { return new URLSearchParams(window.top.location.search); } catch { return new URLSearchParams(location.search); }
}

export const screensOf = (site) => (Array.isArray(site.screens) ? site.screens.filter((s) => s && typeof s.id === 'string' && s.id) : []);

// This device's profile, or null. ?screen=<id> on the address chooses it and keeps it.
export function currentScreen(site) {
  const p = pageParams();
  if (p.has('screen')) {
    const id = p.get('screen');
    storage.set(screenKey(site), !id || id === 'none' ? null : id);
  }
  const id = storage.get(screenKey(site));
  return screensOf(site).find((s) => s.id === id) ?? null;
}

export function chooseScreen(site, id) {
  storage.set(screenKey(site), id || null);
}

export const isGuest = (screen) => !!screen?.guest;

// What a guest may never do from the dashboard: locks, alarms, garage doors and gates,
// and goodnight. Read-only, whatever the button.
const WAY_IN = new Set(['garage', 'gate', 'door']);
export function guestMayCall(domain, service, data, store) {
  if (domain === 'lock' || domain === 'alarm_control_panel' || domain === 'planview_dash') return false;
  const ids = [].concat(data?.entity_id ?? []);
  const wayIn = (id) => id.startsWith('lock.') || id.startsWith('alarm_control_panel.')
    || (id.startsWith('cover.') && WAY_IN.has(store?.get(id)?.attributes?.device_class));
  if (ids.some(wayIn)) return false;
  return true;
}

// Rooms a screen does not show: emptied, so nothing in them can be seen or switched, and
// left out of everything that lists rooms. Returns the hidden rooms.
export function hideRooms(site, screen) {
  const hide = new Set(Array.isArray(screen?.hide_rooms) ? screen.hide_rooms : []);
  if (!hide.size) return [];
  const hidden = [];
  for (const room of site.index.rooms.values()) {
    if (!hide.has(room.id)) continue;
    room.hidden = true;
    const gone = new Set([...room.lights.map((l) => l.entity), ...(room.media ?? []).map((m) => m.entity)]);
    room.lights = [];
    room.media = [];
    delete room.climate;
    delete room.temperature;
    room.status = { opening: [], presence: [], alarm: [], lock: [], battery: [], cover: [] };
    site.index.lights = site.index.lights.filter((id) => !gone.has(id));
    if (site.index.media) site.index.media = site.index.media.filter((id) => !gone.has(id));
    hidden.push(room);
  }
  site.index.climateRooms = site.index.climateRooms.filter((r) => !r.hidden);
  return hidden;
}

// The view a screen starts on, if it names one that exists.
export function startView(site, screen) {
  const v = typeof screen?.start === 'string' ? screen.start : null;
  if (!v) return null;
  if (v === 'overview') return site.overview ? { overview: true } : null;
  if (v.startsWith('plan:')) return site.floorplans.some((p) => p.id === v.slice(5)) ? { plan: v.slice(5) } : null;
  if (v.startsWith('room:')) {
    const room = site.index.rooms.get(v.slice(5));
    return room && !room.hidden ? { room } : null;
  }
  return null;
}
