// Music in the room (roadmap MU1–MU4): speakers and TVs found through their room's area
// or placed, the pulse while one plays, now playing in the room panel, the music view on
// the plan (join, leave, move, group volume), the whole-house chip and goodnight.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, setup, harness, close, check } = require('./lib');

const houseSite = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'sites', 'example-house', 'site.json'), 'utf8'));
const serve = (site, id = 'example-house') => (page) => page.route(`**/sites/${id}/site.json`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(site) }));
const toPlan = async (page, plan = 'house') => {
  await page.locator(`.views .tab[data-view="plan:${plan}"]`).click();
  await page.waitForFunction((p) => document.querySelector('.stage').dataset.view === `plan:${p}`, plan);
  await page.waitForTimeout(600); // the roof lifts first
};
const setState = (page, id, change) => page.evaluate(([i, c]) => {
  const s = window.store.get(i);
  window.store.update({ ...s, ...c, attributes: { ...s.attributes, ...(c.attributes ?? {}) } });
  window.store.flush();
}, [id, change]);
const openRoom = async (page, name) => {
  await page.locator(`.fp.is-active .fp-room[aria-label="${name}"]`).click();
  await page.locator('.panel.is-open').waitFor();
};

describe('music in the room', () => {
  const env = setup();

  test('speakers show up in their rooms by area, and the room pulses while one plays', async () => {
    const page = await harness(env, '?site=example-house');
    await toPlan(page);
    const marks = page.locator('.fp.is-active .fp-speaker');
    assert.equal(await marks.count(), 5, 'every test player in its room');
    const kitchen = page.locator('.fp.is-active .fp-speaker[data-entity="media_player.kitchen_speaker"]');
    assert.match(await kitchen.getAttribute('aria-label'), /Kitchen speaker: Morning jazz/);
    assert.ok(await kitchen.evaluate((n) => n.classList.contains('is-on')));
    const pulses = page.locator('.fp.is-active .fp-music-pulse.is-on');
    assert.equal(await pulses.count(), 1, 'only the kitchen plays');
    // The pulse takes the colour of the album art.
    await page.waitForFunction(() => document.querySelector('.fp.is-active .fp-music-pulse.is-on')?.style.getPropertyValue('--music'));
    assert.equal(await pulses.first().evaluate((n) => getComputedStyle(n).animationName), 'music-pulse');
    // A TV that is on glows; turned off, it does not.
    assert.equal(await page.locator('.fp.is-active .fp-tv-glow.is-on').count(), 1);
    await setState(page, 'media_player.living_room_tv', { state: 'off' });
    assert.equal(await page.locator('.fp.is-active .fp-tv-glow.is-on').count(), 0);
    // Paused: no pulse.
    await setState(page, 'media_player.kitchen_speaker', { state: 'paused' });
    assert.equal(await page.locator('.fp.is-active .fp-music-pulse.is-on').count(), 0);
    check(page);
    await close(page);
  });

  test('light mode keeps the pulse still', async () => {
    const page = await harness(env, '?site=example-house&lite');
    await toPlan(page);
    const pulse = page.locator('.fp.is-active .fp-music-pulse.is-on');
    assert.equal(await pulse.count(), 1);
    assert.equal(await pulse.evaluate((n) => getComputedStyle(n).animationName), 'none');
    assert.equal(await pulse.evaluate((n) => getComputedStyle(n).opacity), '0.18');
    check(page);
    await close(page);
  });

  test('a placed speaker sits where it was placed; turned off in site.json, none show', async () => {
    const site = houseSite();
    const kitchen = site.floorplans[0].rooms.find((r) => r.id === 'kitchen');
    kitchen.media = [{ entity: 'media_player.kitchen_speaker', at: [1000, 1000] }];
    let page = await harness(env, '?site=example-house', { prepare: serve(site) });
    await toPlan(page);
    const dot = page.locator('.fp.is-active .fp-speaker[data-entity="media_player.kitchen_speaker"] .fp-speaker-dot');
    assert.equal(await dot.getAttribute('cx'), '1000');
    assert.equal(await page.locator('.fp.is-active .fp-speaker').count(), 5, 'still one icon per player');
    check(page);
    await close(page);

    site.music = { enabled: false };
    page = await harness(env, '?site=example-house', { prepare: serve(site) });
    await toPlan(page);
    assert.equal(await page.locator('.fp-speaker').count(), 0);
    check(page);
    await close(page);
  });

  test('placement mode never nags about speakers, and places one when asked', async () => {
    const page = await harness(env, '?site=example-house&edit');
    await page.locator('aside.editor').waitFor();
    await toPlan(page);
    const group = page.locator('.editor-list section[data-kind="media"]');
    await group.waitFor();
    assert.doesNotMatch(await group.locator('h3').textContent(), /not placed/i, 'no count of unplaced speakers');
    // Speakers found by area show where they are; the group is not among the unplaced.
    assert.match(await group.textContent(), /Automatically in Kitchen|Kitchen speaker/);
    await group.locator('.editor-ent', { hasText: 'Kitchen speaker' }).click();
    const box = await page.locator('.fp.is-active .fp-room[aria-label="Kitchen"]').boundingBox();
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.7);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('pvd:example-house:draft'))?.floorplans?.[0]?.rooms?.find((r) => r.id === 'kitchen')?.media?.length === 1);
    check(page);
    await close(page);
  });

  test('a speaker missing in Home Assistant warns only when it is placed', async () => {
    const site = houseSite();
    // In an area but gone: nothing is said. Placed and gone: said, like a lamp.
    site.floorplans[0].rooms.find((r) => r.id === 'office').media = [{ entity: 'media_player.gone_speaker', at: [100, 100] }];
    const page = await harness(env, '?site=example-house', { prepare: serve(site) });
    const missing = page.locator('.alerts details[data-key="missing"]');
    await missing.waitFor();
    assert.match(await missing.textContent(), /media_player\.gone_speaker/);
    assert.doesNotMatch(await missing.textContent(), /kitchen_speaker|living_room_tv/);
    check(page);
    await close(page);
  });

  test('now playing: all controls on a full player, only play/pause on a simple one', async () => {
    const page = await harness(env, '?site=example-house');
    await toPlan(page);
    await openRoom(page, 'Kitchen');
    const row = page.locator('.panel .np-row[data-entity="media_player.kitchen_speaker"]');
    assert.equal(await row.locator('.np-title').textContent(), 'Morning jazz');
    assert.equal(await row.locator('.np-by').textContent(), 'The Test Trio');
    assert.ok(await row.locator('img.np-art').isVisible(), 'artwork');
    for (const k of ['prev', 'play', 'next', 'mute']) assert.ok(await row.locator(`[data-np="${k}"]`).isVisible(), k);
    assert.ok(await row.locator('.np-volume').isVisible());
    assert.equal(await row.locator('.np-volume').inputValue(), '35');
    await row.locator('[data-np="play"]').click();
    await page.waitForFunction(() => window.store.get('media_player.kitchen_speaker').state === 'paused');
    assert.equal(await row.locator('[data-np="play"]').getAttribute('aria-label'), 'Play');
    await row.locator('.np-volume').fill('60');
    await row.locator('.np-volume').dispatchEvent('change');
    await page.waitForFunction(() => window.store.get('media_player.kitchen_speaker').attributes.volume_level === 0.6);
    // Favourites from the player's media browser.
    await row.locator('.np-fav-btn').click();
    await row.locator('.np-fav', { hasText: 'Radio One' }).click();
    await page.waitForFunction(() => window.store.get('media_player.kitchen_speaker').attributes.media_title === 'Radio One');
    await page.locator('.panel .icon-btn').click();

    await openRoom(page, 'Office');
    const radio = page.locator('.panel .np-row[data-entity="media_player.office_radio"]');
    assert.ok(await radio.locator('[data-np="play"]').isVisible());
    for (const k of ['prev', 'next', 'mute', 'power']) assert.equal(await radio.locator(`[data-np="${k}"]`).isVisible(), false, `${k} hidden`);
    assert.equal(await radio.locator('.np-volume').isVisible(), false, 'no volume without volume_set');
    assert.equal(await radio.locator('.np-fav-btn').isVisible(), false);
    // No artwork: the speaker icon instead.
    assert.ok(await radio.locator('.np-art-none').isVisible());
    assert.equal(await radio.locator('img.np-art').isVisible(), false);
    check(page);
    await close(page);
  });

  test('several players in a room: the playing one first, sources where there are any', async () => {
    const page = await harness(env, '?site=example-house');
    await toPlan(page);
    await setState(page, 'media_player.living_room_speaker', { state: 'playing', attributes: { media_title: 'Radio' } });
    await setState(page, 'media_player.living_room_tv', { state: 'off' });
    await openRoom(page, 'Living room');
    const rows = page.locator('.panel .np-row');
    assert.equal(await rows.count(), 2);
    assert.equal(await rows.first().getAttribute('data-entity'), 'media_player.living_room_speaker');
    const source = rows.first().locator('.np-source');
    assert.ok(await source.isVisible());
    await source.selectOption('Line in');
    await page.waitForFunction(() => window.store.get('media_player.living_room_speaker').attributes.source === 'Line in');
    check(page);
    await close(page);
  });

  test('a call the player refuses is shown and announced', async () => {
    const page = await harness(env, '?site=example-house');
    await toPlan(page);
    await openRoom(page, 'Kitchen');
    await page.evaluate(() => { window.harness.failCalls = true; });
    await page.locator('.panel .np-row [data-np="next"]').click();
    const toast = page.locator('.toast.is-error[role="alert"]');
    await toast.waitFor();
    assert.match(await toast.textContent(), /Kitchen speaker/);
    page.errors = page.errors.filter((e) => !/failed/.test(e));
    check(page);
    await close(page);
  });

  test('the music view: tap plays, + joins a room, the group volume follows, − leaves', async () => {
    const page = await harness(env, '?site=example-house');
    await toPlan(page);
    const toggle = page.locator('.music-toggle');
    assert.ok(await toggle.isVisible());
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    const bar = page.locator('.music-bar');
    assert.ok(await bar.isVisible());
    assert.match(await bar.locator('.music-group-name').textContent(), /Kitchen: Morning jazz/);
    const room = (id) => page.locator(`.fp.is-active .fp-music-room[data-music-room="${id}"]`);
    const plusOf = (id) => room(id).locator('xpath=following-sibling::*[contains(@class,"is-join")][1]');
    assert.ok(await plusOf('bedroom').isVisible(), 'a speaker that can group gets a +');
    assert.equal(await plusOf('office').isVisible(), false, 'a player that cannot group gets none');
    assert.equal(await plusOf('kitchen').isVisible(), false, 'nor the room that plays');

    await page.evaluate(() => { window.harness.calls.length = 0; });
    await plusOf('bedroom').click();
    await page.waitForFunction(() => window.store.get('media_player.bedroom_speaker').state === 'playing');
    const joinCall = await page.evaluate(() => window.harness.calls.find((c) => c.service === 'join'));
    assert.deepEqual(joinCall.data, { entity_id: 'media_player.kitchen_speaker', group_members: ['media_player.bedroom_speaker'] });
    await page.waitForFunction(() => /Kitchen \+ Bedroom: Morning jazz/.test(document.querySelector('.music-group-name').textContent));
    assert.ok(await room('bedroom').evaluate((n) => n.classList.contains('in-group')));
    assert.equal(await page.locator('.music-members li').count(), 2);

    // The group volume keeps the rooms' balance: the loudest gets the new level.
    await page.evaluate(() => { window.harness.calls.length = 0; });
    await page.locator('.music-main-vol').evaluate((n) => { n.value = '70'; n.dispatchEvent(new Event('change')); });
    const levels = await page.evaluate(() => Object.fromEntries(window.harness.calls.filter((c) => c.service === 'volume_set').map((c) => [c.data.entity_id, c.data.volume_level])));
    assert.equal(levels['media_player.kitchen_speaker'], 0.7);
    assert.ok(levels['media_player.bedroom_speaker'] < 0.7 && levels['media_player.bedroom_speaker'] > 0.3, JSON.stringify(levels));
    await page.waitForFunction(() => window.store.get('media_player.kitchen_speaker').attributes.volume_level === 0.7);
    // Plus and minus per room.
    await page.evaluate(() => { window.harness.calls.length = 0; });
    await page.locator('.music-members li[data-entity="media_player.kitchen_speaker"] button', { hasText: '+' }).click();
    assert.deepEqual(await page.evaluate(() => window.harness.calls.at(-1).data), { entity_id: 'media_player.kitchen_speaker', volume_level: 0.75 });

    const minus = room('bedroom').locator('xpath=following-sibling::*[contains(@class,"is-leave")][1]');
    await minus.click();
    await page.waitForFunction(() => window.store.get('media_player.bedroom_speaker').attributes.group_members.length === 1);
    assert.equal(await page.locator('.music-members li').count(), 1);

    // A tap on a room plays or pauses it, from the keyboard too.
    await room('kitchen').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.store.get('media_player.kitchen_speaker').state === 'paused');
    await page.evaluate(() => window.store.flush());
    assert.match(await bar.locator('.music-group-name').textContent(), /Nothing is playing/);
    await toggle.click();
    assert.ok(await bar.isHidden());
    check(page);
    await close(page);
  });

  test('moving the music: join and leave, or Music Assistant moves the queue', async () => {
    let page = await harness(env, '?site=example-house');
    await toPlan(page);
    await openRoom(page, 'Bedroom');
    const moveBtn = page.locator('.panel [data-action="music-move"]');
    assert.match(await moveBtn.textContent(), /from Kitchen/);
    assert.ok(await page.locator('.panel [data-action="music-join"]').isVisible());
    await page.evaluate(() => { window.harness.calls.length = 0; });
    await moveBtn.click();
    await page.waitForFunction(() => window.store.get('media_player.kitchen_speaker').state === 'idle');
    assert.deepEqual(await page.evaluate(() => window.harness.calls.map((c) => `${c.domain}.${c.service}`)), ['media_player.join', 'media_player.unjoin']);
    assert.equal(await page.evaluate(() => window.store.get('media_player.bedroom_speaker').state), 'playing');
    check(page);
    await close(page);

    const site = houseSite();
    for (const m of Object.values(site.mock.media)) m.platform = 'music_assistant';
    page = await harness(env, '?site=example-house', { prepare: serve(site) });
    await toPlan(page);
    await openRoom(page, 'Bedroom');
    await page.evaluate(() => { window.harness.calls.length = 0; });
    await page.locator('.panel [data-action="music-move"]').click();
    await page.waitForFunction(() => window.store.get('media_player.bedroom_speaker').state === 'playing');
    assert.deepEqual(await page.evaluate(() => window.harness.calls), [{ domain: 'music_assistant', service: 'transfer_queue',
      data: { entity_id: 'media_player.bedroom_speaker', source_player: 'media_player.kitchen_speaker' } }]);
    check(page);
    await close(page);
  });

  test('the header says what plays in the house; Pause all pauses it', async () => {
    const page = await harness(env, '?site=example-house');
    const chip = page.locator('.top-actions [data-action="playing"]');
    await chip.waitFor();
    assert.match(await chip.textContent(), /Kitchen: Morning jazz/);
    await setState(page, 'media_player.bedroom_speaker', { state: 'playing', attributes: { media_title: 'Radio One' } });
    assert.match(await chip.textContent(), /Playing in 2 places/);
    await chip.click();
    const menu = page.locator('.playing-menu');
    assert.ok(await menu.isVisible());
    assert.equal(await menu.locator('.playing-list li').count(), 2);
    await assertMenuInside(page, menu);
    await menu.locator('[data-action="pause-all"]').click();
    await page.waitForFunction(() => ['media_player.kitchen_speaker', 'media_player.bedroom_speaker'].every((id) => window.store.get(id).state === 'paused'));
    await page.evaluate(() => window.store.flush());
    assert.ok(await chip.isHidden(), 'nothing plays, no chip');
    // A TV that is on is not "music playing".
    assert.equal(await page.evaluate(() => window.store.get('media_player.living_room_tv').state), 'on');
    check(page);
    await close(page);
  });

  test('goodnight pauses the music when the dashboard says so', async () => {
    const site = houseSite();
    site.goodnight = { minutes: 5, media: true };
    let page = await harness(env, '?site=example-house', { prepare: serve(site) });
    await page.locator('.top-actions .chip-lights').click();
    await page.locator('.lights-menu [data-action="goodnight"]').click();
    let call = await page.evaluate(() => window.harness.calls.find((c) => c.service === 'goodnight'));
    assert.ok(call.data.media_player.includes('media_player.kitchen_speaker'));
    assert.ok(call.data.media_player.includes('media_player.living_room_tv'));
    check(page);
    await close(page);

    delete site.goodnight.media;
    page = await harness(env, '?site=example-house', { prepare: serve(site) });
    await page.locator('.top-actions .chip-lights').click();
    await page.locator('.lights-menu [data-action="goodnight"]').click();
    call = await page.evaluate(() => window.harness.calls.find((c) => c.service === 'goodnight'));
    assert.equal(call.data.media_player, undefined);
    check(page);
    await close(page);
  });
});

async function assertMenuInside(page, menu) {
  const box = await menu.boundingBox();
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `menu inside the screen: ${JSON.stringify(box)}`);
}
