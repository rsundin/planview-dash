// The closed house: a summer house watched from far away.
//
//   "closed_house": {
//     "entity": "input_boolean.summer_house_closed",   closed while it is on
//     "away": true,          or: closed while nobody (person.*) is home
//     "frost": 5,            a room colder than this is a frost warning (°)
//     "damp": 70,            humidity above this is a damp warning (%)
//     "key": ["climate.hall", "sensor.cellar_temperature"],  devices to hear from
//     "arrive": { "helper": "input_datetime.warm_up_start", "target": 21 }
//   }
//
// While closed, the dashboard leads with what matters when nobody is there: the coldest
// room, heating mode, humidity, leaks and smoke, doors and locks, when Home Assistant last
// heard from the key devices, and when someone was last there. Lights and scenes step back.

import { num } from './util.js';
import { roomTemp, climate, noReading } from './entities.js';
import { isOpen, isUnlocked, isAlarm, isDead } from './status.js';

export const DEFAULT_FROST = 5;
export const DEFAULT_DAMP = 70;
// Key devices quiet longer than this count as not heard from.
export const QUIET_MS = 2 * 3600e3;

export const closedCfg = (site) => (site?.closed_house && typeof site.closed_house === 'object' ? site.closed_house : null);
export const frostLimit = (cfg) => num(cfg?.frost) ?? DEFAULT_FROST;
export const dampLimit = (cfg) => num(cfg?.damp) ?? DEFAULT_DAMP;

const ON = new Set(['on', 'true', 'closed']);
const persons = (store) => store.all().filter((s) => s.entity_id.startsWith('person.'));

// Every entity the closed state depends on.
export function closedStateIds(site, store) {
  const cfg = closedCfg(site);
  if (!cfg) return [];
  return [cfg.entity, ...(cfg.away ? persons(store).map((s) => s.entity_id) : [])].filter(Boolean);
}

export function isClosed(site, store) {
  const cfg = closedCfg(site);
  if (!cfg) return false;
  if (cfg.entity) return ON.has(String(store.get(cfg.entity)?.state ?? '').toLowerCase());
  if (cfg.away) { const p = persons(store); return p.length > 0 && p.every((s) => s.state !== 'home'); }
  return false;
}

// Can this be switched from the dashboard? An input_boolean (or a switch) can.
export const toggleable = (cfg) => /^(input_boolean|switch)\./.test(cfg?.entity ?? '');

const isHumidity = (s) => s?.entity_id?.startsWith('sensor.') && (s.attributes?.device_class === 'humidity');

// Humidity sensors per room: from the room's area, and closed_house.humidity.
export function humidityRooms(site, store) {
  const areas = site.areas;
  const out = [];
  const listed = new Set(closedCfg(site)?.humidity ?? []);
  for (const room of site.index.rooms.values()) {
    if (room.hidden) continue;
    const ids = [];
    if (room.ha_area && areas?.entityArea?.size) {
      for (const s of store.all()) if (isHumidity(s) && areas.entityArea.get(s.entity_id) === room.ha_area) ids.push(s.entity_id);
    }
    for (const id of room.sensors ?? []) if (isHumidity(store.get(id)) && !ids.includes(id)) ids.push(id);
    for (const id of ids) { out.push({ id, room }); listed.delete(id); }
  }
  for (const id of listed) out.push({ id, room: null });
  return out;
}

const FROST_PRESETS = /frost|away|vacation|holiday|eco|borta|semester|frostskydd/i;

// Heating as a whole: 'frost' (frost protection or away), 'comfort', 'off', 'mixed' or null.
export function heatingMode(site, store) {
  const cfg = closedCfg(site);
  const modes = new Set();
  for (const id of site.index.climates) {
    const c = climate(store, id);
    if (!c || c.dead) continue;
    if (c.mode === 'off') modes.add('off');
    else if (FROST_PRESETS.test(c.preset ?? '') || (c.target != null && c.target <= frostLimit(cfg) + 5)) modes.add('frost');
    else modes.add('comfort');
  }
  if (!modes.size) return null;
  return modes.size === 1 ? [...modes][0] : 'mixed';
}

const stamp = (s, key) => { const v = Date.parse(s?.[key]); return Number.isFinite(v) ? v : null; };

/**
 * What the closed house card shows.
 * @returns {{ lowest, heating, humid, alarms, open, unlocked, quiet, heardAt, lastVisit }}
 */
export function closedSummary(site, store, now = Date.now()) {
  const cfg = closedCfg(site) ?? {};
  const rooms = [...site.index.rooms.values()].filter((r) => !r.hidden);
  let lowest = null;
  for (const room of site.index.climateRooms) {
    if (room.hidden) continue;
    const v = roomTemp(store, room);
    if (v != null && (!lowest || v < lowest.value)) lowest = { value: v, room };
  }
  let humid = null;
  for (const { id, room } of humidityRooms(site, store)) {
    const v = num(store.get(id)?.state);
    if (v != null && (!humid || v > humid.value)) humid = { value: v, room, id };
  }
  const status = (kind, test) => [...new Set(rooms.flatMap((r) => r.status?.[kind] ?? []))].filter((id) => test(store.get(id)));
  const keys = (Array.isArray(cfg.key) && cfg.key.length ? cfg.key : [...site.index.climates, ...site.index.temps]).filter((id) => store.get(id));
  // The device Home Assistant has heard from least recently, and the ones it has not heard from.
  const quiet = keys.filter((id) => { const s = store.get(id); const t = stamp(s, 'last_updated') ?? stamp(s, 'last_reported'); return isDead(s) || noReading(s) || (t != null && now - t > QUIET_MS); });
  const heard = keys.map((id) => stamp(store.get(id), 'last_reported') ?? stamp(store.get(id), 'last_updated')).filter((x) => x != null);
  // Someone was there: the latest change of a presence sensor or a door.
  const visits = [...new Set(rooms.flatMap((r) => [...(r.status?.presence ?? []), ...(r.status?.opening ?? [])]))]
    .map((id) => store.get(id)).filter((s) => s && !isDead(s));
  const present = visits.some((s) => s.attributes?.device_class && ['motion', 'occupancy', 'presence'].includes(s.attributes.device_class) && isOpen(s));
  const lastVisit = present ? now : visits.reduce((m, s) => Math.max(m, stamp(s, 'last_changed') ?? 0), 0) || null;
  return {
    lowest,
    heating: heatingMode(site, store),
    humid,
    alarms: status('alarm', isAlarm),
    open: status('opening', isOpen),
    unlocked: status('lock', isUnlocked),
    quiet,
    heardAt: heard.length ? Math.min(...heard) : null,
    lastVisit,
  };
}

// Rooms below the frost limit, and sensors above the damp limit.
export function frostRooms(site, store) {
  const cfg = closedCfg(site);
  if (!cfg) return [];
  const limit = frostLimit(cfg);
  return site.index.climateRooms.filter((r) => !r.hidden).map((room) => ({ room, value: roomTemp(store, room) })).filter((x) => x.value != null && x.value < limit);
}
export function dampSensors(site, store) {
  const cfg = closedCfg(site);
  if (!cfg) return [];
  const limit = dampLimit(cfg);
  return humidityRooms(site, store).map((x) => ({ ...x, value: num(store.get(x.id)?.state) })).filter((x) => x.value != null && x.value > limit);
}

// "3 hours ago", "2 days ago" as Intl says it in the dashboard's language.
export function ago(ms, now, locale) {
  if (ms == null) return null;
  const s = Math.max(0, (now - ms) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (s < 90) return rtf.format(-Math.round(s / 60) || 0, 'minute');
  if (s < 5400) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 129600) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}
