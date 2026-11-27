// The house as screensaver (roadmap W1): after the idle time in kiosk mode the house fills
// the screen with a clock, the outdoor temperature, the next calendar event, warnings and
// what is playing; a touch goes back, night hands over to the dim, light mode keeps still.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, setup, harness, close, check } = require('./lib');

const houseSite = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'sites', 'example-house', 'site.json'), 'utf8'));
const serve = (site) => (page) => page.route('**/sites/example-house/site.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(site) }));
const withAmbient = (idle = {}) => {
  const site = houseSite();
  site.wall_screen = { ...site.wall_screen, idle: { back_after: 1, ...idle }, ambient: { after: 5, calendar: 'calendar.family' } };
  return site;
};
const OPTS = (site) => ({ width: 1280, height: 800, touch: true, prepare: serve(site) });

describe('the house as screensaver', () => {
  const env = setup();

  test('it starts after the idle time with clock, weather, event, warnings and music; a touch goes back', async () => {
    const page = await harness(env, '?site=example-house&kiosk', OPTS(withAmbient()));
    // Into a room first: the screensaver closes it and shows the house.
    await page.locator('.views .tab[data-view="plan:house"]').click();
    await page.evaluate(() => {
      const s = window.store.get('binary_sensor.kitchen_smoke');
      window.store.update({ ...s, state: 'on' });
      window.store.flush();
    });
    const ambient = page.locator('.ambient');
    assert.ok(await ambient.isHidden(), 'not before the idle time');
    await ambient.waitFor({ state: 'visible', timeout: 15000 });
    assert.ok(await page.evaluate(() => document.body.classList.contains('is-ambient')));
    assert.equal(await page.locator('.stage').getAttribute('data-view'), 'overview');
    const box = await page.locator('.stage').boundingBox();
    assert.deepEqual([box.x, box.y, Math.round(box.width), Math.round(box.height)], [0, 0, 1280, 800], 'the house fills the screen');
    assert.match(await ambient.locator('.ambient-clock').textContent(), /^\d{1,2}[:.]\d{2}/);
    assert.equal(await ambient.locator('.ambient-temp').textContent(), '6.5 °C outside');
    assert.match(await ambient.locator('.ambient-event').textContent(), /^(Today|Tomorrow) \d{2}[:.]\d{2} · Football practice$/);
    assert.match(await ambient.locator('.ambient-playing').textContent(), /Kitchen: Morning jazz/);
    assert.equal(await ambient.locator('.ambient-warnings li[data-level="alert"]').count(), 1, 'the smoke alarm');
    assert.equal(await ambient.locator('.ambient-box').evaluate((n) => getComputedStyle(n).animationName), 'ambient-drift');
    assert.equal(await page.locator('.ambient button, .ambient a').count(), 0, 'no buttons');

    // A touch only wakes it: nothing under it opens.
    await page.mouse.click(640, 400);
    await page.waitForFunction(() => !document.body.classList.contains('is-ambient'));
    assert.ok(await ambient.isHidden());
    assert.equal(await page.locator('.panel.is-open').count(), 0);
    assert.ok(await page.locator('header.top').isVisible());
    page.errors = page.errors.filter((e) => !/smoke/i.test(e));
    check(page);
    await close(page);
  });

  test('at night the dim takes over; light mode keeps it still', async () => {
    let page = await harness(env, '?site=example-house&kiosk', OPTS(withAmbient({ dim_from: '00:00', dim_to: '23:59' })));
    await page.locator('.idle-dim').waitFor({ state: 'visible', timeout: 15000 });
    await page.evaluate(() => window.__pvdRun.wall.check());
    assert.ok(await page.locator('.ambient').isHidden(), 'no screensaver under the dim');
    check(page);
    await close(page);

    page = await harness(env, '?site=example-house&kiosk&lite', OPTS(withAmbient()));
    await page.evaluate(() => window.__pvdRun.wall.ambient(true));
    await page.locator('.ambient').waitFor();
    assert.equal(await page.locator('.ambient-box').evaluate((n) => getComputedStyle(n).animationName), 'none');
    check(page);
    await close(page);
  });

  test('off unless asked for, and never outside kiosk mode', async () => {
    let page = await harness(env, '?site=example-house&kiosk', OPTS({ ...houseSite(), wall_screen: { idle: { back_after: 1 } } }));
    await page.waitForTimeout(6500);
    assert.ok(await page.locator('.ambient').isHidden());
    check(page);
    await close(page);

    page = await harness(env, '?site=example-house', OPTS(withAmbient()));
    await page.waitForTimeout(6500);
    assert.ok(await page.locator('.ambient').isHidden());
    check(page);
    await close(page);
  });

  test('the setup guide turns it on', async () => {
    const page = await harness(env, '?site=example-house');
    await page.locator('.top-actions .chip', { hasText: 'Setup' }).click();
    await page.locator('.setup-step', { hasText: 'Wall screen' }).click();
    await page.locator('input[data-field="ambient"]').check();
    await page.locator('.setup .chip-primary', { hasText: 'Save' }).first().click();
    await page.waitForFunction(() => window.harness.saved.length > 0);
    assert.equal(await page.evaluate(() => window.harness.saved.at(-1).wall_screen.ambient), true);
    check(page);
    await close(page);
  });
});
