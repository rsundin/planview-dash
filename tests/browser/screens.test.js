// Screen profiles and guest mode (roadmap W2), the closed house (F1) and warming up
// before arrival (F2, with its estimate tested on recorded curves).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, setup, harness, close, check } = require('./lib');

const houseSite = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'sites', 'example-house', 'site.json'), 'utf8'));
const serve = (site) => (page) => page.route('**/sites/example-house/site.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(site) }));
const view = (page) => page.evaluate(() => document.querySelector('.stage').dataset.view);
const setState = (page, id, change) => page.evaluate(([i, c]) => {
  const s = window.store.get(i);
  window.store.update({ ...s, ...c, attributes: { ...s.attributes, ...(c.attributes ?? {}) } });
  window.store.flush();
}, [id, change]);
const warmup = () => import(pathToFileURL(path.join(ROOT, 'custom_components/planview_dash/frontend/js/warmup.js')).href);

const withScreens = () => {
  const site = houseSite();
  site.screens = [
    { id: 'hall', name: 'Hall', start: 'plan:garage', back_after: 30 },
    { id: 'guest', name: 'Guest room', start: 'room:bedroom_2', guest: true, hide_rooms: ['office'] },
  ];
  (site.mock.entities ??= []).push({ entity: 'cover.garage_port', attributes: { device_class: 'garage' } });
  return site;
};

describe('screen profiles', () => {
  const env = setup();

  test('a profile chosen on the address sets the start view, and stays on the device', async () => {
    const page = await harness(env, '?site=example-house&screen=hall', { prepare: serve(withScreens()) });
    await page.waitForFunction(() => document.querySelector('.stage').dataset.view === 'plan:garage');
    // Without the parameter, the device remembers it.
    await page.goto(page.url().replace('&screen=hall', ''));
    await page.waitForFunction(() => window.harness?.ready);
    await page.evaluate(() => window.harness.ready);
    await page.waitForFunction(() => document.querySelector('.stage')?.dataset.view === 'plan:garage');
    // ?screen=none clears it.
    await page.goto(`${page.url()}&screen=none`);
    await page.waitForFunction(() => window.harness?.ready);
    await page.evaluate(() => window.harness.ready);
    assert.equal(await view(page), 'overview');
    check(page);
    await close(page);
  });

  test('guest mode: no placement or setup, no cameras, hidden rooms, and a garage door stays shut', async () => {
    const page = await harness(env, '?site=example-house&screen=guest', { prepare: serve(withScreens()) });
    // Starts on the guest room, its panel open.
    await page.locator('.panel.is-open').waitFor();
    assert.equal(await page.locator('.panel .panel-title').textContent(), 'Guest room');
    assert.equal(await view(page), 'plan:house');
    assert.ok(await page.evaluate(() => document.body.classList.contains('is-guest')));
    const header = await page.locator('.top-actions').textContent();
    assert.doesNotMatch(header, /\bPlace\b|Setup/);
    assert.equal(await page.locator('.chip-help').count(), 0, 'no problem report');
    assert.equal(await page.locator('.fp.is-active .cam').first().isVisible(), false, 'no cameras');
    assert.equal(await page.locator('[data-action="goodnight"]').count(), 0, 'no goodnight');
    // The office is covered: no name, lamps or speakers in it, nothing to tap.
    assert.equal(await page.locator('.fp.is-active .fp-room.is-hidden').count(), 1);
    assert.equal(await page.locator('.fp.is-active .fp-room[aria-label="Office"]').count(), 0);
    assert.equal(await page.locator('.fp.is-active .fp-speaker[data-entity="media_player.office_radio"]').count(), 0);
    // A garage door or a lock: the call goes nowhere. A lamp still switches.
    const before = await page.evaluate(() => window.harness.calls.length);
    const results = await page.evaluate(async () => [
      await window.__pvdRun.adapter.call('cover', 'open_cover', { entity_id: 'cover.garage_port' }),
      await window.__pvdRun.adapter.call('lock', 'unlock', { entity_id: 'lock.front_door' }),
    ]);
    assert.deepEqual(results, [false, false]);
    assert.equal(await page.evaluate(() => window.harness.calls.length), before, 'nothing reached Home Assistant');
    await page.evaluate(() => window.__pvdRun.adapter.call('homeassistant', 'toggle', { entity_id: 'light.bedroom' }));
    assert.equal(await page.evaluate(() => window.harness.calls.length), before + 1);
    check(page);
    await close(page);
  });

  test('the wall screen sheet picks a profile for this device; a guest screen asks for a long press', async () => {
    const page = await harness(env, '?site=example-house', { prepare: serve(withScreens()) });
    await page.locator('.top-actions .chip', { hasText: 'Kiosk' }).click();
    const sheet = page.locator('.sheet:not([hidden])');
    await sheet.locator('[data-screen="hall"]').click();
    await page.waitForFunction(() => window.harness.starts >= 2);
    await page.evaluate(() => window.harness.ready);
    await page.waitForFunction(() => document.querySelector('.stage').dataset.view === 'plan:garage');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pvd:example-house:screen'))), 'hall');
    check(page);
    await close(page);

    const guest = await harness(env, '?site=example-house&screen=guest', { prepare: serve(withScreens()) });
    await guest.keyboard.press('Escape');
    await guest.locator('.top-actions .chip', { hasText: 'Kiosk' }).click();
    const g = guest.locator('.sheet:not([hidden])');
    assert.equal(await g.locator('[data-screen="hall"]').isVisible(), false, 'hidden behind the long press');
    assert.ok(await g.locator('[data-action="screen-unlock"]').isVisible());
    check(guest);
    await close(guest);
  });

  test('the setup guide adds a guest screen', async () => {
    const page = await harness(env, '?site=example-house');
    await page.locator('.top-actions .chip', { hasText: 'Setup' }).click();
    await page.locator('.setup-step', { hasText: 'Screens' }).click();
    await page.locator('[data-action="screen-add"]').click();
    const card = page.locator('.setup-card[data-screen]');
    await card.locator('input[data-field="name"]').fill('Kitchen tablet');
    await card.locator('select[data-field="start"]').selectOption('plan:house');
    await card.locator('label', { hasText: 'Guest mode' }).locator('input').check();
    await page.locator('.setup .chip-primary', { hasText: 'Save' }).first().click();
    await page.waitForFunction(() => window.harness.saved.length > 0);
    const saved = await page.evaluate(() => window.harness.saved.at(-1).screens);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, 'Kitchen tablet');
    assert.equal(saved[0].start, 'plan:house');
    assert.equal(saved[0].guest, true);
    check(page);
    await close(page);
  });
});

const closedSite = () => {
  const site = houseSite();
  site.closed_house = { entity: 'input_boolean.house_closed', frost: 5, damp: 70, arrive: { helper: 'input_datetime.warm_up_start', target: 21 } };
  (site.mock.entities ??= []).push(
    { entity: 'input_boolean.house_closed', name: 'Summer house closed' },
    { entity: 'input_datetime.warm_up_start', name: 'Warm up start', attributes: { has_date: true, has_time: true } },
  );
  site.mock.sensors['sensor.bathroom_humidity'] = { state: '58', device_class: 'humidity', unit: '%', name: 'Bathroom humidity' };
  site.floorplans[0].rooms.find((r) => r.id === 'bathroom').sensors = ['sensor.bathroom_humidity'];
  return site;
};

describe('the closed house', () => {
  const env = setup();

  test('closed and open: the card leads while closed, lights step back', async () => {
    const page = await harness(env, '?site=example-house', { prepare: serve(closedSite()) });
    await page.evaluate(() => window.harness.stopTestData());
    const chip = page.locator('[data-action="closed-house"]');
    assert.equal(await chip.textContent(), 'House open');
    assert.equal(await page.locator('.card-closed').isVisible(), false);
    await chip.click();
    await page.waitForFunction(() => document.body.classList.contains('is-closed'));
    assert.equal(await chip.textContent(), 'House closed');
    const card = page.locator('.card-closed');
    await card.waitFor();
    const text = await card.textContent();
    assert.match(text, /Coldest/);
    assert.match(text, /Humidity58 % · Bathroom/);
    assert.match(text, /Leaks and smokeNone/);
    assert.match(text, /Doors and locks.*Bedroom window/);
    assert.match(text, /Someone was last there/);
    // The lights card moves to the end.
    const order = await page.evaluate(() => getComputedStyle(document.querySelector('.side .card[data-card="lights"]')).order);
    assert.equal(order, '10');
    await chip.click();
    await page.waitForFunction(() => !document.body.classList.contains('is-closed'));
    assert.equal(await card.isVisible(), false);
    check(page);
    await close(page);
  });

  test('frost and damp warnings use the limits', async () => {
    const page = await harness(env, '?site=example-house', { prepare: serve(closedSite()) });
    await page.evaluate(() => window.harness.stopTestData());
    await setState(page, 'climate.office', { attributes: { current_temperature: 3.5 } });
    await setState(page, 'sensor.bathroom_humidity', { state: '81' });
    const alerts = page.locator('.alerts');
    await page.waitForFunction(() => /Frost risk in Office/.test(document.querySelector('.alerts').textContent));
    assert.match(await alerts.textContent(), /Frost risk in Office: 3\.5°/);
    assert.match(await alerts.textContent(), /Damp in Bathroom: 81 %/);
    check(page);
    await close(page);
  });

  test('arriving: when to start heating, written to the helper for Home Assistant', async () => {
    const page = await harness(env, '?site=example-house', { prepare: serve(closedSite()) });
    await page.evaluate(() => window.harness.stopTestData());
    await page.locator('[data-action="closed-house"]').click();
    const arrive = page.locator('.closed-arrive');
    await arrive.locator('summary').click();
    const out = arrive.locator('.closed-estimate');
    await page.waitForFunction(() => /Start heating|Already/.test(document.querySelector('.closed-estimate').textContent));
    assert.match(await out.textContent(), /to reach 21° by/);
    await arrive.locator('[data-action="arrive-set"]').click();
    await page.waitForFunction(() => /^\d{4}-\d\d-\d\d \d\d:\d\d:00$/.test(window.store.get('input_datetime.warm_up_start').state));
    assert.match(await out.textContent(), /Home Assistant starts the heating/);
    check(page);
    await close(page);
  });

  test('the estimate, on recorded curves', async () => {
    const { heatingRate, warmUpStart, DEFAULT_RATE } = await warmup();
    const h = 3600e3, t0 = Date.UTC(2026, 0, 10, 6);
    // Heated from 8° to 14° in four hours (1.5°/h) with sensor noise, then left to cool.
    const curve = [];
    for (let i = 0; i <= 16; i++) curve.push({ t: t0 + i * h / 4, v: 8 + i * 0.375 + (i % 2 ? 0.05 : -0.05) });
    for (let i = 1; i <= 12; i++) curve.push({ t: t0 + 4 * h + i * h / 2, v: 14 - i * 0.3 });
    const rate = heatingRate(curve);
    assert.ok(Math.abs(rate - 1.5) < 0.15, `about 1.5°/h, got ${rate}`);
    // Two heating spells: the median of their rates.
    const two = [...curve, ...[0, 1, 2, 3, 4].map((i) => ({ t: t0 + 12 * h + i * h / 2, v: 10 + i * 0.5 }))];
    assert.ok(heatingRate(two) > 1 && heatingRate(two) < 1.6);
    assert.equal(heatingRate([{ t: t0, v: 20 }, { t: t0 + h, v: 19.9 }]), null, 'never heated: no rate');

    const arrive = t0 + 12 * h;
    const plan = warmUpStart({ current: 8, target: 21, arrive, rate: 2, now: t0 });
    // 13° at 2°/h with a 20 % margin is 7.8 hours: start 7 h 48 min before (10:12), rounded down to five minutes.
    assert.equal(plan.start.getTime(), Date.UTC(2026, 0, 10, 10, 10));
    assert.equal(plan.late, false);
    const late = warmUpStart({ current: 8, target: 21, arrive, rate: 2, now: arrive - h });
    assert.equal(late.late, true);
    assert.equal(late.start.getTime(), arrive - h, 'starts now');
    assert.equal(warmUpStart({ current: 22, target: 21, arrive, now: t0 }).ready, true);
    assert.ok(DEFAULT_RATE > 0);
  });
});
