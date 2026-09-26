import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createGame, SKILLS } from '../src/game';
import type { Action, GameState } from '../src/game';

const SAVE_KEY = 'tideborn-pilgrimage-v1';
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(
    browserErrors.get(page),
    'The application should produce no JavaScript or console errors',
  ).toEqual([]);
});

async function savedGame(page: Page): Promise<GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'The page should fit horizontally',
  ).toBe(true);
}

async function start(page: Page, fixture?: GameState) {
  if (fixture) {
    await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), {
      key: SAVE_KEY,
      state: fixture,
    });
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The Sunward Shore.' })).toBeVisible();
  await expect(page.locator('.scene-canvas canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Attack/ })).toBeEnabled();
  await expect.poll(async () => (await savedGame(page))?.version).toBe(1);
}

async function actThroughUI(page: Page, state: GameState, action: Action) {
  const current = state.party.find((hero) => hero.id === state.activeHeroId)!;
  const targetId = 'targetId' in action ? action.targetId : undefined;
  const enemy = state.enemies.find((foe) => foe.id === targetId);
  if (enemy) await page.getByRole('button', { name: new RegExp(`^Target ${enemy.name},`) }).click();

  if (action.type === 'skill') {
    const skill = SKILLS[current.id].find((entry) => entry.id === action.skillId)!;
    await page.getByRole('button', { name: /^Skills/ }).click();
    await page
      .locator('.command-sheet')
      .getByRole('button', { name: new RegExp(`^${skill.name}`) })
      .click();
    if (skill.target === 'ally') {
      const ally = state.party.find((hero) => hero.id === targetId)!;
      await page
        .locator('.command-sheet')
        .getByRole('button', { name: new RegExp(`^${ally.name} `) })
        .click();
    }
  } else if (action.type === 'item') {
    const names = { potion: 'Potion', ether: 'Ether', phoenix: 'Phoenix Feather' };
    await page.getByRole('button', { name: /^Items/ }).click();
    await page
      .locator('.command-sheet')
      .getByRole('button', { name: new RegExp(`^${names[action.item]}`) })
      .click();
    const ally = state.party.find((hero) => hero.id === targetId)!;
    await page
      .locator('.command-sheet')
      .getByRole('button', { name: new RegExp(`^${ally.name} `) })
      .click();
  } else {
    const names = {
      attack: /^Attack/,
      guard: /^Guard/,
      overdrive: /^Overdrive/,
      summon: /^Summon/,
    };
    await page.getByRole('button', { name: names[action.type] }).click();
  }

  await expect
    .poll(
      async () => (await savedGame(page)).turn,
      'A command should advance the saved combat state',
    )
    .toBeGreaterThan(state.turn);
  const next = await savedGame(page);
  if (next.phase === 'battle')
    await expect(page.getByRole('button', { name: /^Attack/ })).toBeEnabled();
  else await expect(page.getByRole('heading', { name: 'Victory', exact: true })).toBeVisible();
  return next;
}

test('desktop battle targets, skills, autosave, dialogs and reset work together', async ({
  page,
}, testInfo) => {
  await start(page);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('desktop-battle.png'), fullPage: true });
  const initial = await savedGame(page);

  const attacked = await actThroughUI(page, initial, { type: 'attack', targetId: 'brineback' });
  expect(attacked.enemies[0].hp).toBeLessThan(initial.enemies[0].hp);
  expect(attacked.enemies[1].hp).toBe(initial.enemies[1].hp);
  expect(attacked.activeHeroId).toBe('lyra');
  await expect(
    page.locator('.hero-card.is-active').getByRole('heading', { name: 'Lyra' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Target Brineback,/ })).toHaveAccessibleName(
    new RegExp(`${attacked.enemies[0].hp} of 520 HP`),
  );

  const cast = await actThroughUI(page, attacked, {
    type: 'skill',
    skillId: 'lumina',
    targetId: 'tide-wisp',
  });
  expect(cast.enemies[1].hp).toBeLessThan(attacked.enemies[1].hp);
  expect(cast.enemies[0].hp).toBe(attacked.enemies[0].hp);
  expect(cast.party.find((hero) => hero.id === 'lyra')!.mp).toBe(attacked.party[1].mp - 12);
  expect(cast.activeHeroId).toBe('rook');
  await expect(page.locator('.battle-log p')).toContainText('Lumina');

  await page.getByRole('button', { name: 'Journey map', exact: true }).click();
  const map = page.getByRole('dialog', { name: 'Follow the horizon.' });
  await expect(map).toBeVisible();
  for (const name of ['Solmere Coast', 'Verdant Ruins', 'Temple of the Tides'])
    await expect(map.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(map).toBeHidden();
  await expect(page.getByRole('button', { name: 'Journey map', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Journal', exact: true }).click();
  const journal = page.getByRole('dialog', { name: 'Stories worth keeping.' });
  await expect(journal).toBeVisible();
  await journal.getByRole('button', { name: /^Battle record/ }).click();
  await expect(journal.getByRole('log')).toContainText('Lumina');
  await expect(journal.getByRole('log')).toContainText('Attack');
  await expect(journal.getByRole('log').locator('p').first()).toContainText('Lumina');
  await page.keyboard.press('Escape');
  await expect(journal).toBeHidden();

  await page.reload();
  await expect(page.getByRole('button', { name: /^Attack/ })).toBeEnabled();
  expect(await savedGame(page)).toEqual(cast);
  await expect(
    page.locator('.hero-card.is-active').getByRole('heading', { name: 'Rook' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Game settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Make yourself at home.' });
  await settings.getByRole('button', { name: 'New journey', exact: true }).click();
  await expect(settings.getByText('Leave this journey behind?')).toBeVisible();
  await settings.getByRole('button', { name: 'Keep playing', exact: true }).click();
  expect(await savedGame(page)).toEqual(cast);
  await settings.getByRole('button', { name: 'New journey', exact: true }).click();
  await settings.getByRole('button', { name: 'Yes, start over', exact: true }).click();
  await expect(settings).toBeHidden();
  await expect.poll(async () => (await savedGame(page)).turn).toBe(0);
  expect(await savedGame(page)).toEqual(createGame());
});

test('mobile healing, revival and constellation purchases persist without overflow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = createGame();
  fixture.party[0].hp = 200;
  fixture.party[2].hp = 0;
  fixture.ap = 5;
  await start(page, fixture);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-battle.png'), fullPage: true });

  const healed = await actThroughUI(page, fixture, {
    type: 'item',
    item: 'potion',
    targetId: 'kael',
  });
  expect(healed.party[0].hp).toBeGreaterThan(fixture.party[0].hp);
  expect(healed.inventory.potion).toBe(fixture.inventory.potion - 1);
  expect(healed.events).toContainEqual(expect.objectContaining({ kind: 'heal', targetId: 'kael' }));
  const revived = await actThroughUI(page, healed, {
    type: 'item',
    item: 'phoenix',
    targetId: 'rook',
  });
  expect(revived.party[2].hp).toBeGreaterThan(0);
  expect(revived.inventory.phoenix).toBe(fixture.inventory.phoenix - 1);
  expect(revived.events).toContainEqual(
    expect.objectContaining({ kind: 'revive', targetId: 'rook' }),
  );
  await expect(page.locator('.hero-card.fallen')).toHaveCount(0);

  await page.getByRole('button', { name: 'Constellation grid', exact: true }).click();
  const grid = page.getByRole('dialog', { name: 'A little stronger, together.' });
  await expect(grid.getByRole('button', { name: /^Strength/ })).toBeDisabled();
  await grid.getByRole('button', { name: /^Vitality/ }).click();
  await expect(grid.getByRole('button', { name: /^Vitality.*LEARNED/ })).toBeDisabled();
  await expect(grid.getByRole('button', { name: /^Strength/ })).toBeEnabled();
  const upgraded = await savedGame(page);
  expect(upgraded.ap).toBe(3);
  expect(upgraded.party[0].maxHp).toBe(fixture.party[0].maxHp + 160);
  expect(upgraded.upgrades.kael).toEqual(['vitality']);
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('mobile-constellation.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(grid).toBeHidden();
  await expectNoOverflow(page);
});

function chooseCampaignAction(state: GameState): Action {
  const hero = state.party.find((member) => member.id === state.activeHeroId)!;
  const fallen = state.party.find((member) => member.hp === 0);
  if (fallen && state.inventory.phoenix > 0)
    return { type: 'item', item: 'phoenix', targetId: fallen.id };
  const wounded = state.party
    .filter((member) => member.hp > 0)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (wounded.hp < wounded.maxHp * 0.4) {
    if (hero.id === 'lyra' && hero.mp >= 10)
      return { type: 'skill', skillId: 'mend', targetId: wounded.id };
    if (state.inventory.potion > 0) return { type: 'item', item: 'potion', targetId: wounded.id };
  }
  if (hero.overdrive >= 100) return { type: 'overdrive' };
  if (hero.id === 'lyra' && !state.summonUsed) return { type: 'summon' };
  const foe = state.enemies.filter((enemy) => enemy.hp > 0).sort((a, b) => a.hp - b.hp)[0];
  if ((hero.id === 'rook' || hero.id === 'lyra') && hero.mp < 10 && state.inventory.ether > 0)
    return { type: 'item', item: 'ether', targetId: hero.id };
  if (hero.id === 'rook' && hero.mp >= 10) {
    const elementalSkill =
      SKILLS.rook.find((skill) => skill.element === foe.weakness) ?? SKILLS.rook[0];
    return { type: 'skill', skillId: elementalSkill.id, targetId: foe.id };
  }
  if (hero.id === 'lyra' && hero.mp >= 12)
    return { type: 'skill', skillId: 'lumina', targetId: foe.id };
  if (hero.id === 'kael' && hero.mp >= 6)
    return { type: 'skill', skillId: 'breaking-tide', targetId: foe.id };
  return { type: 'attack', targetId: foe.id };
}

test('a fresh party can complete all three chapters through real combat controls', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await start(page);
  const chapters = ['The Sunward Shore.', 'Where the Forest Remembers.', 'A Promise to the Sea.'];
  let commands = 0;
  for (let chapter = 0; chapter < chapters.length; chapter++) {
    await expect(page.getByRole('heading', { name: chapters[chapter], exact: true })).toBeVisible();
    let state = await savedGame(page);
    while (state.phase === 'battle' && commands < 60) {
      state = await actThroughUI(page, state, chooseCampaignAction(state));
      commands++;
    }
    expect(
      state.phase,
      `Chapter ${chapter + 1} should be winnable without modifying combat state`,
    ).toBe('victory');
    expect(state.encounterIndex).toBe(chapter);
    expect(state.enemies.every((enemy) => enemy.hp === 0)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Victory', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Attack/ })).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath(`chapter-${chapter + 1}-victory.png`),
      fullPage: true,
    });
    await page
      .getByRole('button', {
        name: chapter === 2 ? 'Finish the pilgrimage' : 'Continue the journey',
        exact: true,
      })
      .click();
    if (chapter < 2) await expect(page.getByRole('button', { name: /^Attack/ })).toBeEnabled();
  }
  await expect(
    page.getByRole('heading', { name: 'The sea remembers.', exact: true }),
  ).toBeVisible();
  const ending = await savedGame(page);
  expect(ending.phase).toBe('ending');
  expect(ending.gil).toBe(1660);
  expect(ending.ap).toBe(17);
  expect(commands).toBeGreaterThan(8);
  await testInfo.attach('campaign-result', {
    body: JSON.stringify(
      {
        commands,
        chaptersCompleted: 3,
        gil: ending.gil,
        ap: ending.ap,
        survivingParty: ending.party.map((hero) => ({ name: hero.name, hp: hero.hp })),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'The sea remembers.', exact: true }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('pilgrimage-complete.png'), fullPage: true });
  await page.getByRole('button', { name: 'Journey map', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('A promise kept', { exact: true })).toHaveCount(
    3,
  );
});
