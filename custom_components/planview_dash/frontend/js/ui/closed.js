// The closed house on screen (closed.js): the header switch, the card that leads the side
// column while the house is closed, and "Arriving": when to start heating to be warm on
// arrival (warmup.js). The heating itself is started by Home Assistant at that time,
// through a date and time helper and an automation the guide points to: the dashboard
// keeps no timers of its own.

import { el, fmt } from '../util.js';
import { t } from '../i18n.js';
import { nameOf, roomTemp } from '../entities.js';
import { closedCfg, isClosed, closedStateIds, toggleable, closedSummary, frostLimit, dampLimit, ago } from '../closed.js';
import { heatingRate, warmUpStart, DEFAULT_RATE } from '../warmup.js';

// The header chip: the house's state; for admins a switch when the entity can be switched.
export function createClosedChip({ site, store, adapter, admin }) {
  const cfg = closedCfg(site);
  if (!cfg) return null;
  const canSwitch = admin && toggleable(cfg);
  const chip = el('button', { class: 'chip chip-closed', type: 'button', 'data-action': 'closed-house' });
  if (canSwitch) chip.addEventListener('click', () => adapter.call(cfg.entity.split('.')[0], 'toggle', { entity_id: cfg.entity }));
  else chip.disabled = true;
  const draw = () => {
    const closed = isClosed(site, store);
    chip.textContent = t(closed ? 'closed.chipClosed' : 'closed.chipOpen');
    chip.setAttribute('aria-pressed', String(closed));
    chip.title = canSwitch ? t(closed ? 'closed.open' : 'closed.close') : '';
    chip.classList.toggle('is-closed', closed);
    // Without the switch it is only worth showing while closed.
    chip.hidden = !closed && !canSwitch;
    document.body.classList.toggle('is-closed', closed);
  };
  store.watch(closedStateIds(site, store).length ? closedStateIds(site, store) : null, draw);
  return chip;
}

export function closedCard({ site, store, adapter, openRoom, admin }) {
  const cfg = closedCfg(site);
  if (!cfg) return null;
  const facts = el('dl', { class: 'facts closed-facts' });
  const visit = el('p', { class: 'muted small closed-visit' });
  const arrive = admin ? arriveSection({ site, store, adapter }) : null;
  const root = el('section', { class: 'card card-closed', 'data-card': 'closed', hidden: true },
    el('h2', { class: 'eyebrow' }, t('closed.title')), facts, visit, arrive);
  const row = (k, v, warn = false, room = null) => el('div', { class: warn ? 'is-warn' : '' }, el('dt', {}, k),
    el('dd', {}, room ? el('button', { class: 'linkish', type: 'button', onclick: () => openRoom(room) }, v) : v));
  const deg = (v) => `${fmt(v, 1, site.locale)}°`;
  const draw = () => {
    const closed = isClosed(site, store);
    root.hidden = !closed;
    if (!closed) return;
    const now = Date.now();
    const s = closedSummary(site, store, now);
    const name = (id) => nameOf(id, { store, site });
    facts.replaceChildren(
      s.lowest ? row(t('closed.lowest'), `${deg(s.lowest.value)} · ${s.lowest.room.name}`, s.lowest.value < frostLimit(cfg), s.lowest.room) : null,
      s.heating ? row(t('closed.heating'), t(`closed.heating.${s.heating}`), s.heating === 'off') : null,
      s.humid ? row(t('closed.humidity'), `${Math.round(s.humid.value)} %${s.humid.room ? ` · ${s.humid.room.name}` : ''}`, s.humid.value > dampLimit(cfg), s.humid.room) : null,
      row(t('closed.alarms'), s.alarms.length ? s.alarms.map(name).join(', ') : t('closed.none'), s.alarms.length > 0),
      row(t('closed.doors'), [...s.open, ...s.unlocked].length ? [...s.open, ...s.unlocked].map(name).join(', ') : t('closed.allShut'), [...s.open, ...s.unlocked].length > 0),
      row(t('closed.heard'), s.quiet.length ? t('closed.quiet', { names: s.quiet.map(name).join(', ') })
        : s.heardAt ? t('closed.heardAll', { when: ago(s.heardAt, now, site.locale) }) : t('closed.none'), s.quiet.length > 0));
    visit.textContent = s.lastVisit ? t('closed.lastVisit', { when: ago(s.lastVisit, now, site.locale) }) : t('closed.noVisit');
  };
  // Watched as a whole: the list of entities grows once areas are in.
  store.watch(null, draw);
  return root;
}

// "Arriving": a time, the target, and when heating has to start. Admins only.
function arriveSection({ site, store, adapter }) {
  const cfg = closedCfg(site);
  const target = Number(cfg.arrive?.target) || (site.tempUnit === '°F' ? 70 : 21);
  const helper = /^input_datetime\./.test(cfg.arrive?.helper ?? '') ? cfg.arrive.helper : null;
  const when = el('input', { class: 'setup-input', type: 'datetime-local', 'aria-label': t('closed.arriveAt') });
  const out = el('p', { class: 'small closed-estimate', role: 'status' });
  const setBtn = el('button', { class: 'chip chip-primary', type: 'button', disabled: true, 'data-action': 'arrive-set' }, t('closed.arriveSet'));
  // Tomorrow at six as a start: a time people change rather than type from nothing.
  const d = new Date(Date.now() + 864e5);
  d.setHours(18, 0, 0, 0);
  when.value = localInput(d);
  let rate = null, plan = null;
  const coldest = () => site.index.climateRooms.filter((r) => !r.hidden && roomTemp(store, r) != null)
    .sort((a, b) => roomTemp(store, a) - roomTemp(store, b))[0] ?? null;
  async function estimate() {
    const room = coldest();
    const at = Date.parse(when.value);
    plan = null;
    setBtn.disabled = true;
    if (!room || !Number.isFinite(at)) { out.textContent = t('closed.arriveNoTemp'); return; }
    if (rate == null) {
      try { rate = heatingRate(await adapter.history(room.temperature || room.climate, 72)) ?? DEFAULT_RATE; } catch { rate = DEFAULT_RATE; }
    }
    plan = warmUpStart({ current: roomTemp(store, room), target, arrive: at, rate });
    if (!plan) return;
    const hm = (x) => x.toLocaleString(site.locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    out.textContent = plan.ready ? t('closed.arriveReady', { temp: `${fmt(target, 0, site.locale)}°` })
      : t(plan.late ? 'closed.arriveLate' : 'closed.arriveStart', { start: hm(plan.start), temp: `${fmt(target, 0, site.locale)}°`, at: hm(new Date(at)), room: room.name });
    setBtn.disabled = !helper || plan.ready;
  }
  when.addEventListener('change', estimate);
  setBtn.addEventListener('click', async () => {
    if (!plan || !helper) return;
    const ok = await adapter.call('input_datetime', 'set_datetime', { entity_id: helper, datetime: haDateTime(plan.start) });
    if (ok !== false) out.textContent = t('closed.arriveDone', { start: plan.start.toLocaleString(site.locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) });
  });
  const details = el('details', { class: 'closed-arrive' },
    el('summary', {}, t('closed.arrive')),
    el('label', { class: 'setup-field' }, el('span', { class: 'setup-label' }, t('closed.arriveAt')), when),
    out,
    helper ? el('div', { class: 'row' }, setBtn) : el('p', { class: 'muted small' }, t('closed.arriveNoHelper')));
  details.addEventListener('toggle', () => { if (details.open) estimate(); });
  return details;
}

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
// input_datetime.set_datetime takes the local time as "YYYY-MM-DD HH:MM:SS".
export const haDateTime = (d) => `${localInput(d).replace('T', ' ')}:00`;
