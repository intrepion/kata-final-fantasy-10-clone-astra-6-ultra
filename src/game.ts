export type HeroId = 'kael' | 'lyra' | 'rook';
export type Element = 'fire' | 'ice' | 'lightning' | 'light';
export type ItemId = 'potion' | 'ether' | 'phoenix';
export type GamePhase = 'battle' | 'victory' | 'defeat' | 'ending';

export interface Hero {
  id: HeroId;
  name: string;
  role: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  overdrive: number;
  color: string;
  power: number;
  magic: number;
  speed: number;
  nextTurn: number;
  guarding: boolean;
}

export interface Enemy {
  id: string;
  name: string;
  kind: 'crab' | 'wisp' | 'sentinel' | 'boss';
  hp: number;
  maxHp: number;
  power: number;
  magic: number;
  speed: number;
  nextTurn: number;
  weakness: Element;
  color: string;
  turnsTaken: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  cost: number;
  target: 'enemy' | 'ally' | 'all-enemies' | 'all-allies';
  element?: Element;
  power: number;
}

export interface CombatEvent {
  id: string;
  kind:
    'damage' | 'heal' | 'mana' | 'guard' | 'summon' | 'overdrive' | 'victory' | 'revive' | 'miss';
  sourceId: string;
  targetId?: string;
  amount?: number;
  text: string;
}

export interface Reward {
  gil: number;
  ap: number;
  title: string;
}

export interface GameState {
  version: 1;
  phase: GamePhase;
  encounterIndex: number;
  party: Hero[];
  enemies: Enemy[];
  activeHeroId: HeroId | null;
  clock: number;
  turn: number;
  inventory: Record<ItemId, number>;
  summonUsed: boolean;
  events: CombatEvent[];
  log: string[];
  reward: Reward | null;
  gil: number;
  ap: number;
  upgrades: Record<HeroId, string[]>;
}

export type Action =
  | { type: 'attack'; targetId?: string }
  | { type: 'skill'; skillId: string; targetId?: string }
  | { type: 'guard' }
  | { type: 'item'; item: ItemId; targetId?: string }
  | { type: 'overdrive'; targetId?: string }
  | { type: 'summon' };

export interface TurnEntry {
  id: string;
  name: string;
  kind: 'hero' | 'enemy';
  color: string;
  isActive: boolean;
}

export interface UpgradeNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  stat: 'maxHp' | 'power' | 'magic';
  amount: number;
}

export interface Encounter {
  id: string;
  name: string;
  subtitle: string;
  location: string;
  description: string;
  chapter: string;
  reward: Reward;
  enemies: Enemy[];
}

export const SKILLS: Record<HeroId, Skill[]> = {
  kael: [
    {
      id: 'breaking-tide',
      name: 'Breaking Tide',
      description: 'A heavy strike that delays an enemy’s next turn.',
      cost: 6,
      target: 'enemy',
      power: 1.6,
    },
    {
      id: 'crescent',
      name: 'Crescent Slash',
      description: 'Sweep your blade through every enemy.',
      cost: 10,
      target: 'all-enemies',
      power: 1.1,
    },
  ],
  lyra: [
    {
      id: 'mend',
      name: 'Mending Light',
      description: 'Restore a living ally’s HP.',
      cost: 10,
      target: 'ally',
      power: 2.4,
    },
    {
      id: 'lumina',
      name: 'Lumina',
      description: 'Strike one enemy with sacred light.',
      cost: 12,
      target: 'enemy',
      element: 'light',
      power: 1.6,
    },
  ],
  rook: [
    {
      id: 'spark',
      name: 'Thunder',
      description: 'Lightning magic. Devastating against armored sea fiends.',
      cost: 10,
      target: 'enemy',
      element: 'lightning',
      power: 1.6,
    },
    {
      id: 'ember',
      name: 'Fire',
      description: 'Fire magic. Burns through restless spirits.',
      cost: 10,
      target: 'enemy',
      element: 'fire',
      power: 1.6,
    },
    {
      id: 'frost',
      name: 'Blizzard',
      description: 'Ice magic. Fractures the heart of the ancient guardian.',
      cost: 10,
      target: 'enemy',
      element: 'ice',
      power: 1.6,
    },
  ],
};

export const UPGRADE_NODES: UpgradeNode[] = [
  {
    id: 'vitality',
    name: 'Vitality',
    description: '+160 maximum HP and restore 160 HP.',
    cost: 2,
    stat: 'maxHp',
    amount: 160,
  },
  {
    id: 'strength',
    name: 'Strength',
    description: '+24 physical attack power.',
    cost: 3,
    stat: 'power',
    amount: 24,
  },
  {
    id: 'radiance',
    name: 'Radiance',
    description: '+32 magic power.',
    cost: 3,
    stat: 'magic',
    amount: 32,
  },
];

function enemy(
  id: string,
  name: string,
  kind: Enemy['kind'],
  hp: number,
  power: number,
  speed: number,
  weakness: Element,
  color: string,
  nextTurn: number,
): Enemy {
  return {
    id,
    name,
    kind,
    hp,
    maxHp: hp,
    power,
    magic: power,
    speed,
    weakness,
    color,
    nextTurn,
    turnsTaken: 0,
  };
}

export const ENCOUNTERS: Encounter[] = [
  {
    id: 'shore',
    name: 'Solmere Coast',
    subtitle: 'Where the pilgrimage begins',
    location: 'Solmere Coast',
    chapter: '01',
    description:
      'Beyond the tide, an ancient bell calls. Clear the shore and find the path to the sanctuary.',
    reward: { gil: 240, ap: 4, title: 'The shore is quiet again.' },
    enemies: [
      enemy('brineback', 'Brineback', 'crab', 520, 76, 10, 'lightning', '#e9a65a', 10),
      enemy('tide-wisp', 'Tide Wisp', 'wisp', 430, 64, 12, 'fire', '#b7a8ec', 14),
    ],
  },
  {
    id: 'grove',
    name: 'Verdant Ruins',
    subtitle: 'Memories beneath the roots',
    location: 'Verdant Ruins',
    chapter: '02',
    description:
      'The forest remembers every traveler. Awaken its forgotten altar and open the temple gate.',
    reward: { gil: 380, ap: 5, title: 'A path through the memories.' },
    enemies: [
      enemy('moss-sentinel', 'Moss Sentinel', 'sentinel', 690, 94, 10, 'fire', '#a3c299', 9),
      enemy('hollow-wisp', 'Hollow Wisp', 'wisp', 560, 80, 13, 'light', '#bba0ed', 13),
    ],
  },
  {
    id: 'temple',
    name: 'Temple of the Tides',
    subtitle: 'One last promise to the sea',
    location: 'Temple of the Tides',
    chapter: '03',
    description:
      'The Hollow Warden guards the heart of the tide. Break its vigil and bring the dawn home.',
    reward: { gil: 800, ap: 8, title: 'The tide remembers your names.' },
    enemies: [
      enemy('hollow-warden', 'Hollow Warden', 'boss', 1900, 128, 12, 'ice', '#d9b580', 10),
      enemy('temple-wisp', 'Temple Wisp', 'wisp', 480, 72, 11, 'lightning', '#b6cfee', 15),
    ],
  },
];

export function createGame(): GameState {
  return {
    version: 1,
    phase: 'battle',
    encounterIndex: 0,
    party: [
      {
        id: 'kael',
        name: 'Kael',
        role: 'Guardian',
        hp: 880,
        maxHp: 880,
        mp: 36,
        maxMp: 36,
        overdrive: 65,
        color: '#e7bb6c',
        power: 122,
        magic: 38,
        speed: 13,
        nextTurn: 0,
        guarding: false,
      },
      {
        id: 'lyra',
        name: 'Lyra',
        role: 'Summoner',
        hp: 650,
        maxHp: 650,
        mp: 70,
        maxMp: 70,
        overdrive: 35,
        color: '#7ed2c3',
        power: 64,
        magic: 116,
        speed: 12,
        nextTurn: 3,
        guarding: false,
      },
      {
        id: 'rook',
        name: 'Rook',
        role: 'Black Mage',
        hp: 690,
        maxHp: 690,
        mp: 76,
        maxMp: 76,
        overdrive: 45,
        color: '#b5a5e4',
        power: 72,
        magic: 138,
        speed: 11,
        nextTurn: 6,
        guarding: false,
      },
    ],
    enemies: ENCOUNTERS[0].enemies.map((foe) => ({ ...foe })),
    activeHeroId: 'kael',
    clock: 0,
    turn: 0,
    inventory: { potion: 5, ether: 3, phoenix: 2 },
    summonUsed: false,
    events: [],
    log: ['The tide is turning. Kael, your move.'],
    reward: null,
    gil: 240,
    ap: 0,
    upgrades: { kael: [], lyra: [], rook: [] },
  };
}

function clone(state: GameState): GameState {
  return {
    ...state,
    party: state.party.map((hero) => ({ ...hero })),
    enemies: state.enemies.map((foe) => ({ ...foe })),
    inventory: { ...state.inventory },
    upgrades: {
      kael: [...state.upgrades.kael],
      lyra: [...state.upgrades.lyra],
      rook: [...state.upgrades.rook],
    },
    events: [],
    log: [...state.log],
    reward: state.reward ? { ...state.reward } : null,
  };
}

function emit(state: GameState, event: Omit<CombatEvent, 'id'>): void {
  state.events.push({ ...event, id: `${state.turn}-${state.events.length}` });
  state.log.unshift(event.text);
  state.log = state.log.slice(0, 12);
}

function livingEnemy(state: GameState, targetId?: string): Enemy | undefined {
  return state.enemies.find((foe) => foe.hp > 0 && (!targetId || foe.id === targetId));
}

function livingAlly(state: GameState, source: Hero, targetId?: string): Hero | undefined {
  return state.party.find((hero) => hero.hp > 0 && hero.id === (targetId || source.id));
}

function hitEnemy(
  state: GameState,
  source: Hero,
  target: Enemy,
  amount: number,
  label: string,
  element?: Element,
): void {
  const isWeak = element === target.weakness;
  const damage = Math.max(1, Math.round(amount * (isWeak ? 1.65 : 1)));
  const actual = Math.min(target.hp, damage);
  target.hp = Math.max(0, target.hp - damage);
  emit(state, {
    kind: 'damage',
    sourceId: source.id,
    targetId: target.id,
    amount: actual,
    text: `${source.name} · ${label} → ${target.name} −${damage}${isWeak ? ' · WEAKNESS' : ''}${target.hp === 0 ? ' · defeated' : ''}`,
  });
}

function healAlly(
  state: GameState,
  sourceId: string,
  target: Hero,
  amount: number,
  label: string,
): void {
  const actual = Math.min(target.maxHp - target.hp, Math.round(amount));
  target.hp += actual;
  emit(state, {
    kind: 'heal',
    sourceId,
    targetId: target.id,
    amount: actual,
    text: `${label} → ${target.name} +${actual} HP`,
  });
}

function checkEnd(state: GameState): boolean {
  if (state.enemies.every((foe) => foe.hp === 0)) {
    state.phase = 'victory';
    state.activeHeroId = null;
    state.reward = { ...ENCOUNTERS[state.encounterIndex].reward };
    state.gil += state.reward.gil;
    state.ap += state.reward.ap;
    emit(state, {
      kind: 'victory',
      sourceId: 'party',
      text: `Victory! +${state.reward.ap} AP · +${state.reward.gil} gil`,
    });
    return true;
  }
  if (state.party.every((hero) => hero.hp === 0)) {
    state.phase = 'defeat';
    state.activeHeroId = null;
    emit(state, {
      kind: 'miss',
      sourceId: 'party',
      text: 'The pilgrimage falters. A new dawn is another chance.',
    });
    return true;
  }
  return false;
}

function takeEnemyTurn(state: GameState, foe: Enemy): void {
  foe.turnsTaken += 1;
  state.turn += 1;
  const alive = state.party.filter((hero) => hero.hp > 0);
  const surge = foe.kind === 'boss' && foe.turnsTaken % 3 === 0;
  const selected = alive[(state.turn + state.enemies.indexOf(foe)) % alive.length];
  const targets = surge ? alive : [selected];
  for (const target of targets) {
    const damage = Math.round(foe.power * (surge ? 0.85 : 1) * (target.guarding ? 0.4 : 1));
    const actual = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    target.overdrive = Math.min(100, target.overdrive + (target.guarding ? 16 : 10));
    emit(state, {
      kind: 'damage',
      sourceId: foe.id,
      targetId: target.id,
      amount: actual,
      text: `${foe.name} · ${surge ? 'Tidal Reckoning' : 'Strike'} → ${target.name} −${damage}${target.guarding ? ' · guarded' : ''}${target.hp === 0 ? ' · fallen' : ''}`,
    });
  }
  foe.nextTurn = state.clock + 120 / foe.speed;
}

function selectNextTurn(state: GameState): void {
  while (!checkEnd(state)) {
    const actors = [
      ...state.party
        .filter((hero) => hero.hp > 0)
        .map((hero) => ({ entity: hero, kind: 'hero' as const })),
      ...state.enemies
        .filter((foe) => foe.hp > 0)
        .map((foe) => ({ entity: foe, kind: 'enemy' as const })),
    ].sort((a, b) => a.entity.nextTurn - b.entity.nextTurn);
    const next = actors[0];
    state.clock = Math.max(state.clock, next.entity.nextTurn);
    if (next.kind === 'hero') {
      state.activeHeroId = next.entity.id as HeroId;
      return;
    }
    takeEnemyTurn(state, next.entity as Enemy);
  }
}

export function getAvailableSkills(state: GameState): Skill[] {
  return state.phase === 'battle' && state.activeHeroId ? SKILLS[state.activeHeroId] : [];
}

/** Invalid or unaffordable commands are no-ops; every valid command consumes one turn. */
export function performAction(state: GameState, action: Action): GameState {
  if (state.phase !== 'battle' || !state.activeHeroId) return state;
  const current = state.party.find((hero) => hero.id === state.activeHeroId);
  if (!current || current.hp === 0) return state;
  const next = clone(state);
  const hero = next.party.find((member) => member.id === next.activeHeroId)!;
  hero.guarding = false;
  let delay = 120;

  switch (action.type) {
    case 'attack': {
      const target = livingEnemy(next, action.targetId);
      if (!target) return state;
      hitEnemy(next, hero, target, hero.power, 'Attack');
      break;
    }
    case 'skill': {
      const skill = SKILLS[hero.id].find((entry) => entry.id === action.skillId);
      if (!skill || hero.mp < skill.cost) return state;
      if (skill.target === 'enemy') {
        const target = livingEnemy(next, action.targetId);
        if (!target) return state;
        hitEnemy(
          next,
          hero,
          target,
          (skill.element ? hero.magic : hero.power) * skill.power,
          skill.name,
          skill.element,
        );
        if (skill.id === 'breaking-tide') target.nextTurn += 3;
      } else if (skill.target === 'all-enemies') {
        for (const target of next.enemies.filter((foe) => foe.hp > 0))
          hitEnemy(next, hero, target, hero.power * skill.power, skill.name, skill.element);
      } else if (skill.target === 'ally') {
        const target = livingAlly(next, hero, action.targetId);
        if (!target || target.hp === target.maxHp) return state;
        healAlly(next, hero.id, target, hero.magic * skill.power, skill.name);
      }
      hero.mp -= skill.cost;
      delay = 130;
      break;
    }
    case 'guard':
      hero.guarding = true;
      delay = 90;
      emit(next, {
        kind: 'guard',
        sourceId: hero.id,
        targetId: hero.id,
        text: `${hero.name} guards. Incoming damage reduced by 60% until their next action.`,
      });
      break;
    case 'item': {
      if (!Object.hasOwn(next.inventory, action.item) || next.inventory[action.item] <= 0)
        return state;
      const target = next.party.find((member) => member.id === (action.targetId || hero.id));
      if (!target) return state;
      if (action.item === 'potion') {
        if (target.hp === 0 || target.hp === target.maxHp) return state;
        healAlly(next, hero.id, target, 400, 'Potion');
      } else if (action.item === 'ether') {
        if (target.hp === 0 || target.mp === target.maxMp) return state;
        const actual = Math.min(target.maxMp - target.mp, 35);
        target.mp += actual;
        emit(next, {
          kind: 'mana',
          sourceId: hero.id,
          targetId: target.id,
          amount: actual,
          text: `Ether → ${target.name} +${actual} MP`,
        });
      } else {
        if (target.hp > 0) return state;
        target.hp = Math.round(target.maxHp * 0.5);
        target.nextTurn = next.clock + 6;
        target.guarding = false;
        emit(next, {
          kind: 'revive',
          sourceId: hero.id,
          targetId: target.id,
          amount: target.hp,
          text: `Phoenix Feather → ${target.name} returns with ${target.hp} HP`,
        });
      }
      next.inventory[action.item] -= 1;
      break;
    }
    case 'overdrive': {
      if (hero.overdrive < 100) return state;
      const name =
        hero.id === 'kael'
          ? 'Horizon Break'
          : hero.id === 'lyra'
            ? 'Dawn’s Embrace'
            : 'Astral Tempest';
      emit(next, { kind: 'overdrive', sourceId: hero.id, text: `${hero.name} unleashes ${name}!` });
      for (const target of next.enemies.filter((foe) => foe.hp > 0)) {
        const power =
          hero.id === 'kael'
            ? hero.power * 2.5 + 50
            : hero.id === 'lyra'
              ? hero.magic * 1.2
              : hero.magic * 2.4 + 50;
        hitEnemy(next, hero, target, power, name);
      }
      if (hero.id === 'lyra') {
        for (const target of next.party.filter((member) => member.hp > 0))
          healAlly(next, hero.id, target, target.maxHp * 0.65, name);
      }
      hero.overdrive = 0;
      delay = 160;
      break;
    }
    case 'summon': {
      if (hero.id !== 'lyra' || next.summonUsed) return state;
      const summoner = hero;
      next.summonUsed = true;
      emit(next, {
        kind: 'summon',
        sourceId: hero.id,
        text: 'Lyra calls Auralis, guardian of the dawn. Celestial Tide!',
      });
      for (const target of next.enemies.filter((foe) => foe.hp > 0))
        hitEnemy(next, summoner, target, 285 + summoner.magic * 0.4, 'Celestial Tide', 'light');
      delay = 160;
      break;
    }
    default:
      return state;
  }

  if (action.type !== 'overdrive')
    hero.overdrive = Math.min(100, hero.overdrive + (action.type === 'guard' ? 18 : 12));
  hero.nextTurn = next.clock + delay / hero.speed;
  next.turn += 1;
  selectNextTurn(next);
  return next;
}

/** Leaving an encounter restores 30% HP, 25 MP, and revives fallen allies. */
export function advanceEncounter(state: GameState): GameState {
  if (state.phase !== 'victory') return state;
  const next = clone(state);
  if (state.encounterIndex === ENCOUNTERS.length - 1) {
    next.phase = 'ending';
    return next;
  }
  next.encounterIndex += 1;
  next.phase = 'battle';
  next.clock = 0;
  next.reward = null;
  next.summonUsed = false;
  next.enemies = ENCOUNTERS[next.encounterIndex].enemies.map((foe) => ({ ...foe }));
  next.party.forEach((hero, index) => {
    hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * 0.3));
    hero.mp = Math.min(hero.maxMp, hero.mp + 25);
    hero.guarding = false;
    hero.nextTurn = index * 3;
  });
  next.activeHeroId = 'kael';
  next.inventory.potion += 1;
  emit(next, {
    kind: 'heal',
    sourceId: 'party',
    text: `${ENCOUNTERS[next.encounterIndex].location} · The party rests: +30% HP, +25 MP, +1 potion.`,
  });
  return next;
}

/** Retry the current encounter without losing earned progression or becoming item-locked. */
export function restartEncounter(state: GameState): GameState {
  if (state.phase !== 'defeat') return state;
  const next = clone(state);
  next.phase = 'battle';
  next.clock = 0;
  next.reward = null;
  next.summonUsed = false;
  next.activeHeroId = 'kael';
  next.enemies = ENCOUNTERS[next.encounterIndex].enemies.map((foe) => ({ ...foe }));
  next.party.forEach((hero, index) => {
    hero.hp = hero.maxHp;
    hero.mp = hero.maxMp;
    hero.nextTurn = index * 3;
    hero.guarding = false;
    hero.overdrive = Math.max(hero.overdrive, 40);
  });
  next.inventory.potion = Math.max(3, next.inventory.potion);
  next.inventory.ether = Math.max(2, next.inventory.ether);
  next.inventory.phoenix = Math.max(1, next.inventory.phoenix);
  emit(next, {
    kind: 'heal',
    sourceId: 'party',
    text: 'A new resolve. The party is restored, and the pilgrimage continues.',
  });
  return next;
}

export function upgradeHero(state: GameState, heroId: HeroId, nodeId: string): GameState {
  if (
    state.phase === 'defeat' ||
    state.phase === 'ending' ||
    !Object.hasOwn(state.upgrades, heroId)
  )
    return state;
  const purchased = state.upgrades[heroId];
  const node = UPGRADE_NODES[purchased.length];
  if (!node || node.id !== nodeId || state.ap < node.cost) return state;
  const next = clone(state);
  const hero = next.party.find((member) => member.id === heroId);
  if (!hero) return state;
  next.ap -= node.cost;
  next.upgrades[heroId].push(node.id);
  hero[node.stat] += node.amount;
  if (node.stat === 'maxHp' && hero.hp > 0) hero.hp += node.amount;
  emit(next, {
    kind: 'heal',
    sourceId: hero.id,
    targetId: hero.id,
    text: `${hero.name} awakens ${node.name} · ${node.description}`,
  });
  return next;
}

/** The preview assumes standard attacks; skills, guarding, and delays can alter it. */
export function getTurnOrder(state: GameState, count = 8): TurnEntry[] {
  if (state.phase !== 'battle' || !Number.isFinite(count)) return [];
  const actors = [
    ...state.party
      .filter((hero) => hero.hp > 0)
      .map((hero) => ({ ...hero, kind: 'hero' as const })),
    ...state.enemies.filter((foe) => foe.hp > 0).map((foe) => ({ ...foe, kind: 'enemy' as const })),
  ];
  const result: TurnEntry[] = [];
  for (let index = 0; index < Math.min(Math.max(0, Math.floor(count)), 30); index += 1) {
    actors.sort((a, b) => a.nextTurn - b.nextTurn);
    const actor = actors[0];
    if (!actor) break;
    result.push({
      id: actor.id,
      name: actor.name,
      kind: actor.kind,
      color: actor.color,
      isActive: index === 0 && actor.id === state.activeHeroId,
    });
    actor.nextTurn = Math.max(state.clock, actor.nextTurn) + 120 / actor.speed;
  }
  return result;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, min = 0, max = 1_000_000): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length < 2_000;

/** Reject malformed, old, or incompatible saves without allowing a broken battle to load. */
export function validateSave(value: unknown): GameState | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !['battle', 'victory', 'defeat', 'ending'].includes(String(value.phase))
  )
    return null;
  if (
    !finite(value.encounterIndex, 0, ENCOUNTERS.length - 1) ||
    !Number.isInteger(value.encounterIndex)
  )
    return null;
  if (
    !finite(value.clock) ||
    !finite(value.turn) ||
    !Number.isInteger(value.turn) ||
    !finite(value.gil) ||
    !finite(value.ap)
  )
    return null;
  if (
    !Array.isArray(value.party) ||
    value.party.length !== 3 ||
    !Array.isArray(value.enemies) ||
    value.enemies.length !== 2
  )
    return null;
  const ids = new Set<string>();
  for (const hero of value.party) {
    if (
      !isRecord(hero) ||
      !['kael', 'lyra', 'rook'].includes(String(hero.id)) ||
      ids.has(String(hero.id))
    )
      return null;
    ids.add(String(hero.id));
    if (![hero.name, hero.role, hero.color].every(isText) || typeof hero.guarding !== 'boolean')
      return null;
    if (
      !finite(hero.maxHp, 1, 100_000) ||
      !finite(hero.hp, 0, hero.maxHp) ||
      !finite(hero.maxMp, 1, 1_000) ||
      !finite(hero.mp, 0, hero.maxMp)
    )
      return null;
    if (
      !finite(hero.overdrive, 0, 100) ||
      !finite(hero.power, 1, 100_000) ||
      !finite(hero.magic, 1, 100_000) ||
      !finite(hero.speed, 1, 100) ||
      !finite(hero.nextTurn)
    )
      return null;
  }
  const expectedEnemies = ENCOUNTERS[value.encounterIndex].enemies;
  for (let index = 0; index < value.enemies.length; index += 1) {
    const foe = value.enemies[index];
    if (
      !isRecord(foe) ||
      foe.id !== expectedEnemies[index].id ||
      foe.kind !== expectedEnemies[index].kind
    )
      return null;
    if (
      ![foe.name, foe.color].every(isText) ||
      !['fire', 'ice', 'lightning', 'light'].includes(String(foe.weakness))
    )
      return null;
    if (
      !finite(foe.maxHp, 1, 100_000) ||
      !finite(foe.hp, 0, foe.maxHp) ||
      !finite(foe.power, 1, 100_000) ||
      !finite(foe.magic, 1, 100_000)
    )
      return null;
    if (
      !finite(foe.speed, 1, 100) ||
      !finite(foe.nextTurn) ||
      !finite(foe.turnsTaken) ||
      !Number.isInteger(foe.turnsTaken)
    )
      return null;
  }
  if (
    !isRecord(value.inventory) ||
    !['potion', 'ether', 'phoenix'].every(
      (key) =>
        finite(value.inventory && (value.inventory as Record<string, unknown>)[key], 0, 999) &&
        Number.isInteger((value.inventory as Record<string, unknown>)[key]),
    )
  )
    return null;
  if (typeof value.summonUsed !== 'boolean' || !isRecord(value.upgrades)) return null;
  for (const id of ['kael', 'lyra', 'rook']) {
    const nodes = value.upgrades[id];
    if (
      !Array.isArray(nodes) ||
      nodes.length > UPGRADE_NODES.length ||
      !nodes.every((node, index) => node === UPGRADE_NODES[index].id)
    )
      return null;
  }
  if (
    !Array.isArray(value.events) ||
    value.events.length > 40 ||
    !value.events.every(
      (event) =>
        isRecord(event) &&
        isText(event.id) &&
        isText(event.kind) &&
        isText(event.sourceId) &&
        isText(event.text) &&
        (event.targetId === undefined || isText(event.targetId)) &&
        (event.amount === undefined || finite(event.amount)),
    )
  )
    return null;
  if (!Array.isArray(value.log) || value.log.length > 12 || !value.log.every(isText)) return null;
  if (
    value.reward !== null &&
    (!isRecord(value.reward) ||
      !finite(value.reward.gil) ||
      !finite(value.reward.ap) ||
      !isText(value.reward.title))
  )
    return null;
  const state = value as unknown as GameState;
  const livingHeroes = state.party.filter((hero) => hero.hp > 0);
  const livingEnemies = state.enemies.filter((foe) => foe.hp > 0);
  if (state.phase === 'battle') {
    const active = livingHeroes.find((hero) => hero.id === state.activeHeroId);
    if (
      !active ||
      livingEnemies.length === 0 ||
      state.reward !== null ||
      active.nextTurn > state.clock + 0.000001
    )
      return null;
    if ([...livingHeroes, ...livingEnemies].some((actor) => actor.nextTurn < active.nextTurn))
      return null;
  } else if (state.activeHeroId !== null) return null;
  if (
    (state.phase === 'victory' || state.phase === 'ending') &&
    (livingEnemies.length > 0 || state.reward === null)
  )
    return null;
  if (state.phase === 'ending' && state.encounterIndex !== ENCOUNTERS.length - 1) return null;
  if (state.phase === 'defeat' && livingHeroes.length > 0) return null;
  return JSON.parse(JSON.stringify(state)) as GameState;
}
