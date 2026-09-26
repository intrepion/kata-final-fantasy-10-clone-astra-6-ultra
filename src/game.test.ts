import { describe, expect, it } from 'vitest';
import {
  advanceEncounter,
  createGame,
  ENCOUNTERS,
  getAvailableSkills,
  getTurnOrder,
  performAction,
  restartEncounter,
  upgradeHero,
  validateSave,
  type Action,
  type GameState,
} from './game';

function soloDuel(): GameState {
  const state = createGame();
  state.party[1].hp = 0;
  state.party[2].hp = 0;
  state.enemies[1].hp = 0;
  state.enemies[0].power = 100;
  state.enemies[0].nextTurn = 1;
  return state;
}

function winEncounter(state: GameState): GameState {
  const prepared = structuredClone(state);
  for (const foe of prepared.enemies) foe.hp = 1;
  prepared.summonUsed = false;
  const lyraTurn =
    prepared.activeHeroId === 'lyra' ? prepared : performAction(prepared, { type: 'guard' });
  return performAction(lyraTurn, { type: 'summon' });
}

describe('conditional turn battle', () => {
  it('starts with a real encounter and forecasts heroes and enemies without mutation', () => {
    const state = createGame();
    const saved = JSON.stringify(state);
    const order = getTurnOrder(state);
    expect(state.phase).toBe('battle');
    expect(state.enemies).toHaveLength(2);
    expect(state.party[0].overdrive).toBe(65);
    expect(order).toHaveLength(8);
    expect(order[0]).toMatchObject({ id: 'kael', kind: 'hero', isActive: true });
    expect(order.some((entry) => entry.kind === 'enemy')).toBe(true);
    expect(JSON.stringify(state)).toBe(saved);
  });

  it('resolves an attack immutably, moves to the next hero, and automatically resolves enemy turns', () => {
    const original = createGame();
    const before = JSON.stringify(original);
    const first = performAction(original, { type: 'attack', targetId: 'brineback' });
    expect(first.activeHeroId).toBe('lyra');
    expect(first.enemies[0].hp).toBe(original.enemies[0].hp - original.party[0].power);
    expect(JSON.stringify(original)).toBe(before);
    let state = first;
    for (let index = 0; index < 4; index += 1) state = performAction(state, { type: 'guard' });
    expect(state.party.some((hero) => hero.hp < hero.maxHp)).toBe(true);
    expect(state.enemies.some((foe) => foe.turnsTaken > 0)).toBe(true);
    expect(state.activeHeroId).not.toBeNull();
    expect(validateSave(state)).not.toBeNull();
  });

  it('guarding cuts the enemy strike by 60% and expires when that hero acts again', () => {
    const state = soloDuel();
    const guarded = performAction(state, { type: 'guard' });
    const attacked = performAction(state, { type: 'attack' });
    expect(guarded.party[0].hp).toBe(840);
    expect(attacked.party[0].hp).toBe(780);
    expect(guarded.party[0].guarding).toBe(true);
    const next = performAction(guarded, { type: 'attack' });
    expect(next.party[0].guarding).toBe(false);
    expect(next.party[0].hp).toBe(740);
  });

  it('delays an enemy with Breaking Tide and spends only the specified MP', () => {
    const state = createGame();
    const next = performAction(state, {
      type: 'skill',
      skillId: 'breaking-tide',
      targetId: 'brineback',
    });
    expect(next.party[0].mp).toBe(state.party[0].mp - 6);
    expect(next.enemies[0].nextTurn).toBe(state.enemies[0].nextTurn + 3);
    expect(next.enemies[0].hp).toBe(state.enemies[0].hp - Math.round(state.party[0].power * 1.6));
  });

  it('applies elemental weaknesses and rejects foreign or unaffordable skills', () => {
    let state = createGame();
    state = performAction(state, { type: 'guard' });
    state = performAction(state, { type: 'guard' });
    expect(state.activeHeroId).toBe('rook');
    expect(getAvailableSkills(state).map((skill) => skill.id)).toEqual(['spark', 'ember', 'frost']);
    const weak = performAction(state, { type: 'skill', skillId: 'spark', targetId: 'brineback' });
    const neutral = performAction(state, {
      type: 'skill',
      skillId: 'frost',
      targetId: 'brineback',
    });
    expect(weak.enemies[0].hp).toBeLessThan(neutral.enemies[0].hp);
    expect(weak.events.some((event) => event.text.includes('WEAKNESS'))).toBe(true);
    expect(performAction(state, { type: 'skill', skillId: 'mend' })).toBe(state);
    state.party[2].mp = 9;
    expect(performAction(state, { type: 'skill', skillId: 'spark' })).toBe(state);
  });

  it('does not consume turns for dead targets, full-health healing, or empty inventory', () => {
    const state = createGame();
    expect(performAction(state, { type: 'attack', targetId: 'missing' })).toBe(state);
    expect(performAction(state, { type: 'item', item: 'potion', targetId: 'kael' })).toBe(state);
    expect(performAction(state, { type: 'item', item: 'phoenix', targetId: 'kael' })).toBe(state);
    state.inventory.potion = 0;
    state.party[0].hp = 400;
    expect(performAction(state, { type: 'item', item: 'potion' })).toBe(state);
  });

  it('restores HP and MP with consumables, clamps resources, and decrements inventory', () => {
    const state = createGame();
    state.party[0].hp = 700;
    state.party[2].mp = 68;
    const healed = performAction(state, { type: 'item', item: 'potion', targetId: 'kael' });
    expect(healed.party[0].hp).toBe(880);
    expect(healed.inventory.potion).toBe(4);
    const restored = performAction(healed, { type: 'item', item: 'ether', targetId: 'rook' });
    expect(restored.party[2].mp).toBe(76);
    expect(restored.inventory.ether).toBe(2);
  });

  it('revives a fallen ally at half HP and returns them to the schedule', () => {
    const state = createGame();
    state.party[2].hp = 0;
    const next = performAction(state, { type: 'item', item: 'phoenix', targetId: 'rook' });
    expect(next.party[2].hp).toBe(345);
    expect(next.inventory.phoenix).toBe(1);
    expect(getTurnOrder(next).some((entry) => entry.id === 'rook')).toBe(true);
    expect(next.events.some((event) => event.kind === 'revive')).toBe(true);
    expect(state.party[2].hp).toBe(0);
  });

  it('only allows Lyra to summon and leaves resources and the turn unchanged for other heroes', () => {
    const state = createGame();
    expect(performAction(state, { type: 'summon' })).toBe(state);
    const rookTurn = performAction(performAction(state, { type: 'guard' }), { type: 'guard' });
    expect(rookTurn.activeHeroId).toBe('rook');
    expect(performAction(rookTurn, { type: 'summon' })).toBe(rookTurn);
    expect(rookTurn.summonUsed).toBe(false);
  });

  it('allows one summon per encounter, consumes Lyra’s turn, and requires her to be alive', () => {
    const state = performAction(createGame(), { type: 'guard' });
    expect(state.activeHeroId).toBe('lyra');
    const next = performAction(state, { type: 'summon' });
    expect(next.summonUsed).toBe(true);
    expect(next.activeHeroId).toBe('rook');
    expect(next.enemies.every((foe, index) => foe.hp < state.enemies[index].hp)).toBe(true);
    let nextLyraTurn = next;
    while (nextLyraTurn.activeHeroId !== 'lyra')
      nextLyraTurn = performAction(nextLyraTurn, { type: 'guard' });
    expect(performAction(nextLyraTurn, { type: 'summon' })).toBe(nextLyraTurn);
    state.party[1].hp = 0;
    expect(performAction(state, { type: 'summon' })).toBe(state);
  });

  it('requires a full overdrive gauge and empties it on use', () => {
    const state = createGame();
    expect(performAction(state, { type: 'overdrive' })).toBe(state);
    state.party[0].overdrive = 100;
    const next = performAction(state, { type: 'overdrive' });
    expect(next.party[0].overdrive).toBe(0);
    expect(next.enemies.every((foe) => foe.hp < 220)).toBe(true);
    expect(next.events.some((event) => event.kind === 'overdrive')).toBe(true);
  });
});

describe('the pilgrimage', () => {
  it('awards an encounter once and carries resources into the next location', () => {
    const state = createGame();
    state.party[0].hp = 100;
    state.party[0].mp = 1;
    const victory = winEncounter(state);
    expect(victory.phase).toBe('victory');
    expect(victory.ap).toBe(4);
    expect(victory.gil).toBe(480);
    expect(victory.reward).toEqual(ENCOUNTERS[0].reward);
    expect(performAction(victory, { type: 'attack' })).toBe(victory);
    const next = advanceEncounter(victory);
    expect(next.phase).toBe('battle');
    expect(next.encounterIndex).toBe(1);
    expect(next.party[0].hp).toBe(364);
    expect(next.party[0].mp).toBe(26);
    expect(next.ap).toBe(4);
    expect(next.inventory.potion).toBe(6);
    expect(next.summonUsed).toBe(false);
    expect(validateSave(next)).not.toBeNull();
    expect(advanceEncounter(next)).toBe(next);
  });

  it('only spends AP on the next node, applies the stat gain, and prevents duplicate purchases', () => {
    const state = createGame();
    state.ap = 8;
    expect(upgradeHero(state, 'kael', 'strength')).toBe(state);
    const next = upgradeHero(state, 'kael', 'vitality');
    expect(next.party[0].maxHp).toBe(1040);
    expect(next.party[0].hp).toBe(1040);
    expect(next.ap).toBe(6);
    expect(next.upgrades.kael).toEqual(['vitality']);
    expect(upgradeHero(next, 'kael', 'vitality')).toBe(next);
    const strength = upgradeHero(next, 'kael', 'strength');
    expect(strength.party[0].power).toBe(146);
    expect(strength.ap).toBe(3);
    expect(state.ap).toBe(8);
    strength.ap = 0;
    expect(upgradeHero(strength, 'kael', 'radiance')).toBe(strength);
  });

  it('ends after the third encounter and preserves total rewards', () => {
    let state = createGame();
    for (let index = 0; index < 3; index += 1) {
      state = winEncounter(state);
      expect(state.phase).toBe('victory');
      state = advanceEncounter(state);
    }
    expect(state.phase).toBe('ending');
    expect(state.ap).toBe(17);
    expect(state.gil).toBe(1660);
    expect(state.encounterIndex).toBe(2);
    expect(validateSave(state)).not.toBeNull();
  });

  it('detects a party wipe and retries the same encounter with earned progress intact', () => {
    const state = soloDuel();
    state.ap = 5;
    const upgraded = upgradeHero(state, 'kael', 'vitality');
    upgraded.party[0].hp = 1;
    const defeat = performAction(upgraded, { type: 'attack' });
    expect(defeat.phase).toBe('defeat');
    expect(defeat.activeHeroId).toBeNull();
    expect(validateSave(defeat)).not.toBeNull();
    const retried = restartEncounter(defeat);
    expect(retried.phase).toBe('battle');
    expect(retried.party.every((hero) => hero.hp === hero.maxHp && hero.mp === hero.maxMp)).toBe(
      true,
    );
    expect(retried.party[0].maxHp).toBe(1040);
    expect(retried.ap).toBe(3);
    expect(retried.gil).toBe(240);
    expect(retried.upgrades.kael).toEqual(['vitality']);
    expect(validateSave(retried)).not.toBeNull();
  });

  it('can complete the entire campaign with normal commands and deterministic decisions', () => {
    function play(): { state: GameState; moves: number } {
      let state = createGame();
      let moves = 0;
      while (state.phase !== 'ending' && state.phase !== 'defeat' && moves < 100) {
        if (state.phase === 'victory') {
          state = upgradeHero(state, 'kael', 'vitality');
          state = advanceEncounter(state);
          continue;
        }
        const hero = state.party.find((member) => member.id === state.activeHeroId)!;
        const enemy = state.enemies.find((foe) => foe.hp > 0)!;
        const injured = [...state.party]
          .filter((member) => member.hp > 0)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        let action: Action = { type: 'attack', targetId: enemy.id };
        if (hero.overdrive === 100) action = { type: 'overdrive' };
        else if (!state.summonUsed && hero.id === 'lyra') action = { type: 'summon' };
        else if (injured.hp < injured.maxHp * 0.45 && state.inventory.potion > 0)
          action = { type: 'item', item: 'potion', targetId: injured.id };
        else if (hero.id === 'rook' && hero.mp >= 10)
          action = {
            type: 'skill',
            skillId:
              enemy.weakness === 'fire' ? 'ember' : enemy.weakness === 'ice' ? 'frost' : 'spark',
            targetId: enemy.id,
          };
        else if (hero.id === 'lyra' && hero.mp >= 12)
          action = { type: 'skill', skillId: 'lumina', targetId: enemy.id };
        else if (hero.id === 'kael' && hero.mp >= 6)
          action = { type: 'skill', skillId: 'breaking-tide', targetId: enemy.id };
        const next = performAction(state, action);
        expect(next).not.toBe(state);
        expect(validateSave(next)).not.toBeNull();
        state = next;
        moves += 1;
      }
      return { state, moves };
    }
    const result = play();
    expect(result.state.phase).toBe('ending');
    expect(result.moves).toBeGreaterThan(10);
    expect(result.moves).toBeLessThan(60);
    expect(play()).toEqual(result);
  });
});

describe('save validation', () => {
  it('round trips serializable state without sharing references', () => {
    const state = createGame();
    const loaded = validateSave(JSON.parse(JSON.stringify(state)));
    expect(loaded).toEqual(state);
    expect(loaded).not.toBe(state);
    loaded!.party[0].hp = 1;
    expect(state.party[0].hp).toBe(880);
  });

  it('rejects incomplete, non-finite, out-of-order, or incompatible battle state', () => {
    expect(validateSave(null)).toBeNull();
    expect(validateSave({ version: 1 })).toBeNull();
    const state = createGame();
    expect(validateSave({ ...state, version: 2 })).toBeNull();
    expect(validateSave({ ...state, clock: Infinity })).toBeNull();
    expect(validateSave({ ...state, activeHeroId: 'rook' })).toBeNull();
    expect(validateSave({ ...state, phase: 'ending' })).toBeNull();
    expect(
      validateSave({ ...state, upgrades: { ...state.upgrades, kael: ['radiance'] } }),
    ).toBeNull();
    state.enemies[0].hp = -1;
    expect(validateSave(state)).toBeNull();
  });
});
