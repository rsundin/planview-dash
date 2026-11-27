// Setup guide, step: the closed house (closed.js). For a summer house watched from far
// away: what says it is closed, the frost and damp limits, and warming up before arrival.

import { el } from '../../util.js';
import { t } from '../../i18n.js';
import { DEFAULT_FROST, DEFAULT_DAMP } from '../../closed.js';

export function houseStep(ctx) {
  const { cfg, changed, render, field, section, intro, input, select, entityOptions } = ctx;
  return function house() {
    const on = !!cfg.closed_house;
    const H = cfg.closed_house ?? {};
    const enable = el('input', { type: 'checkbox', checked: on, 'data-field': 'closed-on' });
    enable.addEventListener('change', () => {
      if (enable.checked) cfg.closed_house = { frost: DEFAULT_FROST, damp: DEFAULT_DAMP };
      else delete cfg.closed_house;
      changed();
      render();
    });
    const set = (key, parse = (v) => v) => (v) => { const x = parse(v); if (x === '' || x == null || Number.isNaN(x)) delete H[key]; else H[key] = x; };
    const arrive = (key, parse = (v) => v) => (v) => {
      const x = parse(v);
      H.arrive ??= {};
      if (x === '' || x == null || Number.isNaN(x)) delete H.arrive[key]; else H.arrive[key] = x;
      if (!Object.keys(H.arrive).length) delete H.arrive;
    };
    const away = el('input', { type: 'checkbox', checked: !!H.away });
    away.addEventListener('change', () => { set('away')(away.checked || null); changed(); });
    const switches = (s) => /^(input_boolean|switch|binary_sensor)\./.test(s.entity_id);
    const helpers = (s) => s.entity_id.startsWith('input_datetime.') && s.attributes?.has_date !== false && s.attributes?.has_time !== false;
    return [
      intro('closed.intro'),
      section(t('closed.title'),
        el('label', {}, enable, ` ${t('closed.enable')}`),
        on ? field(t('closed.entity'), select(entityOptions(switches), H.entity, set('entity'), { 'data-field': 'closed-entity' }), t('closed.entityHelp')) : null,
        on ? el('label', {}, away, ` ${t('closed.away')}`) : null,
        on ? el('div', { class: 'setup-row' },
          field(t('closed.frost'), input(H.frost ?? DEFAULT_FROST, set('frost', Number), { type: 'number', step: '0.5', 'data-field': 'closed-frost' })),
          field(t('closed.damp'), input(H.damp ?? DEFAULT_DAMP, set('damp', Number), { type: 'number', step: '1', min: '30', max: '100', 'data-field': 'closed-damp' }))) : null),
      on ? section(t('closed.arrive'),
        el('p', { class: 'muted small' }, t('closed.arriveHelp')),
        field(t('closed.arriveHelper'), select(entityOptions(helpers), H.arrive?.helper, arrive('helper'), { 'data-field': 'closed-helper' })),
        field(t('closed.arriveTarget'), input(H.arrive?.target ?? '', arrive('target', (v) => (v === '' ? null : Number(v))), { type: 'number', step: '0.5', placeholder: '21' })),
        el('pre', { class: 'setup-code' }, AUTOMATION)) : null,
    ];
  };
}

// The automation the guide points to: at the helper's time, the heating goes to comfort.
const AUTOMATION = `alias: Warm up the summer house before arrival
triggers:
  - trigger: time
    at: input_datetime.warm_up_start
actions:
  - action: climate.set_preset_mode
    target:
      area_id: summer_house
    data:
      preset_mode: comfort`;
