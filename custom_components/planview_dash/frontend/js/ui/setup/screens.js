// Setup guide, step: screen profiles (screens.js). A profile per wall screen or tablet:
// where it starts, when it goes back there, guest mode and rooms it does not show.

import { el } from '../../util.js';
import { t } from '../../i18n.js';

export function screensStep(ctx) {
  const { cfg, changed, render, field, section, intro, input, select, slug, uniqueId, rooms } = ctx;
  return function screens() {
    const list = (cfg.screens ??= []);
    const tidy = () => { if (!cfg.screens.length) delete cfg.screens; };
    const views = () => [
      ['', t('screen.startDefault')],
      ...(cfg.overview ? [['overview', t('app.overview')]] : []),
      ...cfg.floorplans.map((p) => [`plan:${p.id}`, p.name]),
      ...rooms().map(([id, name]) => [`room:${id}`, `${t('screen.room')}: ${name}`]),
    ];
    const card = (s, i) => {
      const set = (key) => (v) => { if (v === '' || v == null || v === false) delete s[key]; else s[key] = v; };
      const guest = el('input', { type: 'checkbox', checked: !!s.guest });
      guest.addEventListener('change', () => { set('guest')(guest.checked); changed(); render(); });
      const hide = new Set(s.hide_rooms ?? []);
      return el('div', { class: 'setup-card', 'data-screen': s.id },
        el('div', { class: 'row-between' },
          el('strong', {}, s.name || s.id),
          el('button', { class: 'chip chip-danger', type: 'button', onclick: () => { list.splice(i, 1); tidy(); changed(); render(); } }, t('setup.remove'))),
        field(t('screen.name'), input(s.name, (v) => { s.name = v; }, { 'data-field': 'name' })),
        el('p', { class: 'muted small' }, t('screen.address', { id: s.id })),
        field(t('screen.start'), select(views(), s.start, set('start'), { 'data-field': 'start' })),
        field(t('screen.backAfter'), select([['', t('screen.backDefault')], ['0', t('setup.idleNever')], ...[30, 60, 120, 300, 600].map((n) => [String(n), t(n < 60 ? 'setup.seconds' : 'setup.minutes', { n: n < 60 ? n : n / 60 })])],
          s.back_after == null ? '' : String(s.back_after), (v) => set('back_after')(v === '' ? null : Number(v)))),
        el('label', {}, guest, ` ${t('screen.guestMode')}`),
        el('p', { class: 'muted small' }, t('screen.guestHelp')),
        rooms().length ? el('p', { class: 'setup-label' }, t('screen.hideRooms')) : null,
        rooms().length ? el('ul', { class: 'setup-checks' }, rooms().map(([id, name]) => {
          const box = el('input', { type: 'checkbox', checked: hide.has(id) });
          box.addEventListener('change', () => {
            const now = (s.hide_rooms ?? []).filter((x) => x !== id);
            if (box.checked) now.push(id);
            set('hide_rooms')(now.length ? now : null);
            changed();
          });
          return el('li', {}, el('label', {}, box, ` ${name}`));
        })) : null);
    };
    const add = () => {
      const name = t('screen.newName', { n: list.length + 1 });
      list.push({ id: uniqueId(slug(name), list.map((s) => s.id)), name });
      changed();
      render();
    };
    return [
      intro('screen.intro'),
      section(t('screen.title'),
        ...list.map(card),
        el('button', { class: 'chip chip-primary', type: 'button', 'data-action': 'screen-add', onclick: add }, t('screen.add'))),
    ];
  };
}
