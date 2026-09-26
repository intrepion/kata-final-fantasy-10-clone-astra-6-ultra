import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Crown,
  Droplets,
  Flame,
  FlaskConical,
  Heart,
  Leaf,
  Map,
  Maximize2,
  Moon,
  RotateCcw,
  Shield,
  Sparkles,
  Sun,
  Sword,
  Swords,
  Volume2,
  VolumeX,
  WandSparkles,
  Waves,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import {
  advanceEncounter,
  createGame,
  getAvailableSkills,
  getTurnOrder,
  performAction,
  restartEncounter,
  upgradeHero,
  validateSave,
  UPGRADE_NODES,
} from './game';
import type { Action, CombatEvent, GameState, HeroId, Skill } from './game';
import { BattleScene } from './scene';
import { Soundscape } from './audio';

const SAVE_KEY = 'tideborn-pilgrimage-v1';
const locations = [
  {
    name: 'The Sunward Shore',
    place: 'Solmere Coast',
    chapter: 'I',
    subtitle: 'Every great journey begins with a small act of courage.',
    description:
      'Beyond the fishing village, something stirs in the shallows. Clear a path to the old pilgrim road.',
    icon: Waves,
  },
  {
    name: 'Where the Forest Remembers',
    place: 'Verdant Ruins',
    chapter: 'II',
    subtitle: 'The old world has not forgotten its guardians.',
    description:
      'Follow the overgrown pilgrim road. Among the roots, ancient sentinels still keep their watch.',
    icon: Leaf,
  },
  {
    name: 'A Promise to the Sea',
    place: 'Temple of the Tides',
    chapter: 'III',
    subtitle: 'Some promises are stronger than the tide.',
    description:
      'The tidekeeper waits beneath the broken crown. Stand together, and let the sea remember your names.',
    icon: Crown,
  },
];
const heroDescriptions: Record<HeroId, string> = {
  kael: 'A guardian with a borrowed sword and a promise to keep. Quick on his feet, quicker to protect his friends.',
  lyra: 'The last summoner of Solmere. She hears a song in the tides that no one else remembers.',
  rook: 'A wandering scholar who insists every mystery has an explanation. Preferably a very explosive one.',
};
const elementIcons: Record<string, typeof Zap> = {
  lightning: Zap,
  fire: Flame,
  ice: Droplets,
  light: Sun,
};
type Panel = 'journey' | 'grid' | 'journal' | 'help' | 'settings' | null;
type Command = 'skills' | 'items' | null;
type ItemId = 'potion' | 'ether' | 'phoenix';

function readGame(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return validateSave(JSON.parse(raw)) ?? createGame();
  } catch {
    /* Browser storage is optional. */
  }
  return createGame();
}
const percentage = (value: number, max: number) => Math.max(0, Math.min(100, (value / max) * 100));

function Modal({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], [tabindex="0"]',
        ) ?? [],
      );
      if (!buttons.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`modal ${wide ? 'modal-wide' : ''}`}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button close-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState<GameState>(readGame);
  const [panel, setPanel] = useState<Panel>(null);
  const [command, setCommand] = useState<Command>(null);
  const [allyAction, setAllyAction] = useState<{ skill?: Skill; item?: ItemId } | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [actingName, setActingName] = useState('');
  const [combatEffects, setCombatEffects] = useState<CombatEvent[]>([]);
  const busyRef = useRef(false);
  const [muted, setMuted] = useState(true);
  const [gridHero, setGridHero] = useState<HeroId>('kael');
  const [journalTab, setJournalTab] = useState<'story' | 'log'>('story');
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(true);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [sceneError, setSceneError] = useState(false);
  const [anchors, setAnchors] = useState<Record<string, { x: number; y: number }>>({});
  const sceneContainer = useRef<HTMLDivElement>(null);
  const scene = useRef<BattleScene | null>(null);
  const sound = useRef(new Soundscape());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const closePanel = useCallback(() => {
    setPanel(null);
    setResetConfirm(false);
  }, []);
  const location = locations[Math.min(game.encounterIndex, 2)];
  const active = game.party.find((hero) => hero.id === game.activeHeroId) ?? game.party[0];
  const aliveEnemies = game.enemies.filter((enemy) => enemy.hp > 0);
  const selectedEnemy = aliveEnemies.find((enemy) => enemy.id === target) ?? aliveEnemies[0];
  const turnOrder = getTurnOrder(game, 6);
  const inBattle = game.phase === 'battle';
  const ready = inBattle && !busy;

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game));
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }, [game]);
  useEffect(() => {
    if (!sceneContainer.current) return;
    let instance: BattleScene;
    try {
      instance = new BattleScene(sceneContainer.current);
      instance.onTarget = (id) => setTarget(id);
      scene.current = instance;
    } catch (error) {
      console.error('Unable to create the battle scene', error);
      setSceneError(true);
    }
    return () => {
      instance?.destroy();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    const sync = () => {
      scene.current?.setState({
        stage: game.encounterIndex,
        activeHero: game.activeHeroId,
        enemies: game.enemies.map((enemy) => ({ id: enemy.id, hp: enemy.hp, maxHp: enemy.maxHp })),
        heroes: game.party.map((hero) => ({ id: hero.id, hp: hero.hp })),
      });
      const points: Record<string, { x: number; y: number }> = {};
      for (const actor of [...game.party, ...game.enemies]) {
        const anchor = scene.current?.getAnchor(actor.id);
        if (anchor) points[actor.id] = anchor;
      }
      setAnchors(points);
    };
    sync();
    const observer = new ResizeObserver(sync);
    if (sceneContainer.current) observer.observe(sceneContainer.current);
    return () => observer.disconnect();
  }, [game]);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      sound.current.destroy();
    },
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const act = useCallback(
    (action: Action) => {
      if (busyRef.current || game.phase !== 'battle') return;
      const next = performAction(game, action);
      if (next === game) {
        setToast('That action is not available right now.');
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setCommand(null);
      setAllyAction(null);
      setActingName(
        game.party.find((hero) => hero.id === game.activeHeroId)?.name ?? 'Your guardian',
      );
      const visualKind =
        action.type === 'skill'
          ? action.skillId
          : action.type === 'item'
            ? action.item
            : action.type;
      scene.current?.playAction(
        visualKind,
        game.activeHeroId,
        'targetId' in action ? action.targetId : undefined,
      );
      sound.current.play(action.type);
      timers.current.push(
        setTimeout(
          () => {
            setCombatEffects(next.events);
            setGame(next);
            const enemyActions = next.events.filter(
              (event) =>
                event.kind === 'damage' &&
                game.enemies.some((enemy) => enemy.id === event.sourceId),
            );
            enemyActions.forEach((event, index) =>
              timers.current.push(
                setTimeout(() => {
                  scene.current?.playAction('attack', event.sourceId, event.targetId);
                }, index * 180),
              ),
            );
            if (next.phase === 'victory') sound.current.play('victory');
            timers.current.push(
              setTimeout(() => {
                busyRef.current = false;
                setBusy(false);
              }, 380),
            );
            timers.current.push(
              setTimeout(
                () => setCombatEffects((current) => (current === next.events ? [] : current)),
                1700,
              ),
            );
          },
          action.type === 'summon' ? 1200 : 550,
        ),
      );
    },
    [game],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        panel ||
        busy ||
        !inBattle ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target as HTMLElement)?.matches('input,textarea,select')
      )
        return;
      if (event.key === 'Escape') {
        setCommand(null);
        setAllyAction(null);
        return;
      }
      if (event.key === '1') act({ type: 'attack', targetId: selectedEnemy?.id });
      if (event.key === '2') {
        setAllyAction(null);
        setCommand((current) => (current === 'skills' ? null : 'skills'));
      }
      if (event.key === '3') act({ type: 'guard' });
      if (event.key === '4') {
        setAllyAction(null);
        setCommand((current) => (current === 'items' ? null : 'items'));
      }
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && aliveEnemies.length) {
        event.preventDefault();
        const index = aliveEnemies.findIndex((enemy) => enemy.id === selectedEnemy?.id);
        setTarget(aliveEnemies[(index + 1) % aliveEnemies.length].id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [act, panel, busy, inBattle, selectedEnemy, aliveEnemies]);

  const toggleSound = async () => {
    try {
      const enabled = await sound.current.toggle();
      setMuted(!enabled);
    } catch {
      setToast('Audio is unavailable in this browser.');
    }
  };
  const useSkill = (skill: Skill) => {
    if (skill.target === 'ally') {
      setAllyAction({ skill });
      return;
    }
    act({ type: 'skill', skillId: skill.id, targetId: selectedEnemy?.id });
  };
  const newJourney = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    busyRef.current = false;
    setGame(createGame());
    setTarget('');
    setBusy(false);
    setCombatEffects([]);
    setCommand(null);
    setAllyAction(null);
    closePanel();
    setToast('A new story begins.');
  };
  const continueJourney = () => {
    setGame(advanceEncounter(game));
    setTarget('');
    setCommand(null);
    setAllyAction(null);
  };
  const currentHero = game.party.find((hero) => hero.id === gridHero)!;
  const statusLine = busy
    ? `${actingName} is acting…`
    : inBattle
      ? `${active.name}'s turn`
      : game.phase === 'defeat'
        ? 'The tide will turn again'
        : 'A little closer to the horizon';

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a
          className="brand-mark"
          href="#"
          aria-label="Tideborn home"
          onClick={(event) => {
            event.preventDefault();
            closePanel();
          }}
        >
          <img src={`${import.meta.env.BASE_URL}emblem.svg`} alt="" />
        </a>
        <div className="sidebar-rule" />
        <nav className="nav-buttons">
          <button
            className={`nav-button ${!panel ? 'active' : ''}`}
            aria-label="Battle"
            title="Battle"
            onClick={closePanel}
          >
            <Swords />
            <span>Battle</span>
          </button>
          <button
            className={`nav-button ${panel === 'journey' ? 'active' : ''}`}
            aria-label="Journey map"
            title="Journey map"
            onClick={() => setPanel('journey')}
          >
            <Map />
            <span>Journey</span>
          </button>
          <button
            className={`nav-button ${panel === 'grid' ? 'active' : ''}`}
            aria-label="Constellation grid"
            title="Constellation grid"
            onClick={() => setPanel('grid')}
          >
            <Sparkles />
            <span>Growth</span>
            {game.ap > 0 && <i className="notification-dot" />}
          </button>
          <button
            className={`nav-button ${panel === 'journal' ? 'active' : ''}`}
            aria-label="Journal"
            title="Journal"
            onClick={() => setPanel('journal')}
          >
            <BookOpen />
            <span>Journal</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-button"
            aria-label={muted ? 'Enable sound' : 'Mute sound'}
            title={muted ? 'Enable sound' : 'Mute sound'}
            onClick={toggleSound}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button
            className="nav-button"
            aria-label="How to play"
            title="How to play"
            onClick={() => setPanel('help')}
          >
            <CircleHelp />
          </button>
          <span className="sidebar-edition">I — III</span>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="wordmark">
            Tideborn<span>THE PILGRIMAGE</span>
          </div>
          <div className="topbar-center">
            <span className="small-diamond" /> AN ORIGINAL TURN-BASED ADVENTURE{' '}
            <span className="small-diamond" />
          </div>
          <button className="chapter-menu" onClick={() => setPanel('journey')}>
            <Compass size={15} />
            <span>Chapter {location.chapter}</span>
            <ChevronDown size={13} />
          </button>
        </header>
        <div className="game-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="chapter-line" />
                THE PILGRIMAGE <span className="breadcrumb-slash">/</span> CHAPTER{' '}
                {location.chapter}
              </div>
              <h1>
                {location.name}
                <span className="title-period">.</span>
              </h1>
              <p>{location.subtitle}</p>
            </div>
            <div className="resources">
              <span className="save-status">
                <span className={saved ? 'save-dot' : 'save-dot unsaved'} />
                {saved ? 'Progress saved' : 'Session only'}
              </span>
              <div className="resource-row">
                <span className="currency-icon">G</span>
                <strong>{game.gil.toLocaleString()}</strong>
                <span className="resource-label">gil</span>
                <span className="resource-divider" />
                <Sparkles size={15} />
                <strong>{game.ap}</strong>
                <span className="resource-label">AP</span>
              </div>
            </div>
          </div>

          <section
            className={`battle-stage stage-${game.encounterIndex} ${busy ? 'is-acting' : ''}`}
            aria-label="Battle arena"
          >
            <div
              ref={sceneContainer}
              className="scene-canvas"
              aria-label="Three-dimensional tropical battle scene"
            />
            {sceneError && (
              <div className="scene-fallback">
                <Waves size={90} />
                <h2>The Sunward Sea</h2>
                <p>
                  3D graphics aren’t available. Your adventure is still fully playable using the
                  commands below.
                </p>
              </div>
            )}
            <div className="stage-vignette" />
            <div className="location-tag">
              <span className="location-icon">
                <location.icon size={17} />
              </span>
              <div>
                <span>{location.place}</span>
                <small>THE SOUTHERN ARCHIPELAGO</small>
              </div>
            </div>
            <button
              className="scene-expand"
              aria-label="Show journey map"
              title="Show journey map"
              onClick={() => setPanel('journey')}
            >
              <Maximize2 size={16} />
            </button>
            <div className="encounter-tag">
              <span className="encounter-dot" />
              {inBattle
                ? 'FIEND ENCOUNTER'
                : game.phase === 'defeat'
                  ? 'PARTY DEFEATED'
                  : 'ENCOUNTER CLEARED'}
              <span className="encounter-number">0{game.encounterIndex + 1} / 03</span>
            </div>
            {inBattle &&
              aliveEnemies.map((enemy, index) => {
                const point = anchors[enemy.id] ?? {
                  x: index ? 0.73 : 0.59,
                  y: index ? 0.26 : 0.42,
                };
                const Element = elementIcons[enemy.weakness] ?? Zap;
                return (
                  <button
                    key={enemy.id}
                    className={`enemy-label ${selectedEnemy?.id === enemy.id ? 'selected' : ''}`}
                    style={{
                      left: `${Math.max(27, Math.min(79, point.x * 100))}%`,
                      top: `${Math.max(24, Math.min(61, point.y * 100 - 9))}%`,
                    }}
                    onClick={() => setTarget(enemy.id)}
                    disabled={busy}
                    aria-label={`Target ${enemy.name}, ${enemy.hp} of ${enemy.maxHp} HP, weak to ${enemy.weakness}`}
                  >
                    <span className="target-indicator">
                      <ChevronDown size={17} />
                    </span>
                    <span className="enemy-label-top">
                      <span>{enemy.name}</span>
                      <Element size={12} />
                    </span>
                    <span className="enemy-hp">
                      <span style={{ width: `${percentage(enemy.hp, enemy.maxHp)}%` }} />
                    </span>
                    <span className="enemy-health-number">
                      {enemy.hp} <span>/ {enemy.maxHp}</span>
                    </span>
                  </button>
                );
              })}
            <div className="turn-order" aria-label="Upcoming turn order">
              <span className="turn-heading">TURN ORDER</span>
              <div className="timeline-entries">
                {turnOrder.map((entry, index) => (
                  <div
                    key={`${entry.id}-${index}`}
                    className={`turn-entry ${index === 0 ? 'current' : ''} ${entry.kind === 'enemy' ? 'enemy-turn' : ''}`}
                    title={`${index === 0 ? 'Now' : `Turn ${index + 1}`}: ${entry.name}`}
                  >
                    <span className="turn-number">
                      {index === 0 ? 'NOW' : String(index + 1).padStart(2, '0')}
                    </span>
                    {entry.kind === 'hero' ? (
                      <img
                        src={`${import.meta.env.BASE_URL}portraits/${entry.id}.svg`}
                        alt={entry.name}
                      />
                    ) : (
                      <div className="fiend-turn-icon">
                        <Wind size={20} />
                      </div>
                    )}
                    <span className="turn-name">{entry.name.split(' ')[0]}</span>
                    {index === 0 && <span className="turn-pointer" />}
                  </div>
                ))}
              </div>
              <ArrowDown size={12} className="timeline-arrow" />
            </div>
            <div className="stage-caption">
              <span className="small-diamond" />
              <span>A promise carried by the tide.</span>
            </div>
            {combatEffects
              .filter((event) => event.targetId && event.amount !== undefined)
              .map((event, index) => {
                const point = anchors[event.targetId!] ?? { x: 0.5, y: 0.5 };
                const healing =
                  event.kind === 'heal' || event.kind === 'mana' || event.kind === 'revive';
                const weak = event.text.includes('WEAKNESS');
                return (
                  <div
                    key={event.id}
                    aria-hidden="true"
                    className={`damage-number ${healing ? 'healing' : ''} ${weak ? 'weakness' : ''}`}
                    style={{
                      left: `${point.x * 100}%`,
                      top: `${point.y * 100 + 2 + index * 3}%`,
                      animationDelay: `${index * 0.06}s`,
                    }}
                  >
                    <span>{weak ? 'WEAKNESS' : healing ? 'RECOVER' : ''}</span>
                    {healing ? '+' : '−'}
                    {event.amount}
                  </div>
                );
              })}
            <div className="battle-state-pill">
              <span className={`pulse-dot ${busy ? 'busy' : ''}`} />
              {statusLine}
              {inBattle && !busy && <span className="pill-hint">Choose a command</span>}
            </div>

            {(command || allyAction) && ready && (
              <div className="command-sheet">
                <div className="sheet-title">
                  <span>
                    {allyAction
                      ? 'Choose an ally'
                      : command === 'skills'
                        ? `${active.name}’s abilities`
                        : 'The satchel'}
                  </span>
                  <button
                    className="sheet-close"
                    aria-label="Close commands"
                    onClick={() => {
                      setCommand(null);
                      setAllyAction(null);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
                {allyAction ? (
                  <div className="ability-list">
                    {game.party.map((hero) => (
                      <button
                        key={hero.id}
                        disabled={
                          allyAction.item === 'phoenix'
                            ? hero.hp > 0
                            : hero.hp <= 0 ||
                              (allyAction.item === 'ether'
                                ? hero.mp === hero.maxMp
                                : hero.hp === hero.maxHp)
                        }
                        onClick={() => {
                          if (allyAction.skill)
                            act({ type: 'skill', skillId: allyAction.skill.id, targetId: hero.id });
                          else if (allyAction.item)
                            act({ type: 'item', item: allyAction.item, targetId: hero.id });
                        }}
                      >
                        <img
                          className="ally-mini"
                          src={`${import.meta.env.BASE_URL}portraits/${hero.id}.svg`}
                          alt=""
                        />
                        <span>
                          <strong>{hero.name}</strong>
                          <small>
                            {hero.hp} / {hero.maxHp} HP · {hero.mp} / {hero.maxMp} MP
                          </small>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    ))}
                  </div>
                ) : command === 'skills' ? (
                  <div className="ability-list">
                    {getAvailableSkills(game).map((skill) => {
                      const Icon = elementIcons[skill.element ?? ''] ?? WandSparkles;
                      return (
                        <button
                          key={skill.id}
                          disabled={active.mp < skill.cost}
                          onClick={() => useSkill(skill)}
                        >
                          <Icon size={20} />
                          <span>
                            <strong>{skill.name}</strong>
                            <small>{skill.description}</small>
                          </span>
                          <span className="ability-cost">
                            {skill.cost}
                            <small>MP</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ability-list">
                    {(
                      [
                        {
                          id: 'potion',
                          name: 'Potion',
                          text: 'Restore 400 HP to one ally.',
                          icon: Heart,
                        },
                        {
                          id: 'ether',
                          name: 'Ether',
                          text: 'Restore 35 MP to one ally.',
                          icon: Droplets,
                        },
                        {
                          id: 'phoenix',
                          name: 'Phoenix Feather',
                          text: 'Bring a fallen ally back to the fight.',
                          icon: Flame,
                        },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        disabled={game.inventory[item.id] <= 0}
                        onClick={() => setAllyAction({ item: item.id })}
                      >
                        <item.icon size={20} />
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.text}</small>
                        </span>
                        <span className="item-count">×{game.inventory[item.id]}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="sheet-tip">
                  {allyAction
                    ? 'Items and abilities use your current turn.'
                    : command === 'skills'
                      ? `Enemy abilities will target ${selectedEnemy?.name ?? 'the selected fiend'}.`
                      : 'A little preparation goes a long way.'}
                </div>
              </div>
            )}

            {game.phase !== 'battle' && (
              <div className="result-overlay">
                <div className="result-card">
                  <span className="result-ornament">✧</span>
                  <span className="eyebrow">
                    {game.phase === 'defeat'
                      ? 'A MOMENT TO BEGIN AGAIN'
                      : game.phase === 'ending'
                        ? 'THE FIRST PILGRIMAGE · COMPLETE'
                        : 'TOGETHER, WE GO ON'}
                  </span>
                  <h2>
                    {game.phase === 'defeat'
                      ? 'Even the tide retreats.'
                      : game.phase === 'ending'
                        ? 'The sea remembers.'
                        : 'Victory'}
                  </h2>
                  <p>
                    {game.phase === 'defeat'
                      ? 'Your journey is not over. Regroup with your progress intact, keep your party healed, and watch the turn order.'
                      : game.phase === 'ending'
                        ? 'Three strangers. One promise. A horizon full of possibilities. Thank you for playing Tideborn.'
                        : `${location.place} is safe. Take a breath. The horizon is waiting.`}
                  </p>
                  {game.reward && game.phase === 'victory' && (
                    <div className="victory-rewards">
                      <span>
                        <span className="currency-icon">G</span>
                        <strong>+{game.reward.gil}</strong> gil
                      </span>
                      <span>
                        <Sparkles size={18} />
                        <strong>+{game.reward.ap}</strong> AP
                      </span>
                    </div>
                  )}
                  <div className="result-actions">
                    {game.phase === 'victory' ? (
                      <>
                        <button className="primary-button" onClick={continueJourney}>
                          {game.encounterIndex === 2
                            ? 'Finish the pilgrimage'
                            : 'Continue the journey'}
                          <ArrowRight size={16} />
                        </button>
                        <button className="text-button" onClick={() => setPanel('grid')}>
                          <Sparkles size={14} />
                          Spend ability points
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary-button"
                        onClick={
                          game.phase === 'defeat'
                            ? () => {
                                setGame(restartEncounter(game));
                                setTarget('');
                                setCommand(null);
                                setAllyAction(null);
                              }
                            : newJourney
                        }
                      >
                        {game.phase === 'defeat' ? 'Retry this encounter' : 'Begin a new journey'}
                        <RotateCcw size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="battle-log" aria-live="polite">
            <span className="log-spark">✦</span>
            <p>
              {busy
                ? `${actingName} makes their move…`
                : (game.log[0] ?? 'The sea breeze carries a warning. Fiends approach!')}
            </p>
            <button
              aria-label="View full battle log"
              onClick={() => {
                setJournalTab('log');
                setPanel('journal');
              }}
            >
              Battle log
              <ChevronRight size={14} />
            </button>
          </div>

          <section className="battle-controls" aria-label="Combat controls">
            <div className="commands-panel">
              <div className="section-label">
                <span>YOUR MOVE</span>
                <span className="command-actor">
                  {active.name}
                  <span className="small-diamond" />
                </span>
              </div>
              <div className="command-grid">
                <button
                  className="action-button attack-button"
                  disabled={!ready}
                  onClick={() => act({ type: 'attack', targetId: selectedEnemy?.id })}
                >
                  <Sword size={19} />
                  <span>Attack</span>
                  <kbd>1</kbd>
                </button>
                <button
                  className={`action-button ${command === 'skills' ? 'chosen' : ''}`}
                  disabled={!ready}
                  onClick={() => {
                    setAllyAction(null);
                    setCommand(command === 'skills' ? null : 'skills');
                  }}
                >
                  <WandSparkles size={18} />
                  <span>Skills</span>
                  <kbd>2</kbd>
                </button>
                <button
                  className="action-button"
                  disabled={!ready}
                  onClick={() => act({ type: 'guard' })}
                >
                  <Shield size={18} />
                  <span>Guard</span>
                  <kbd>3</kbd>
                </button>
                <button
                  className={`action-button ${command === 'items' ? 'chosen' : ''}`}
                  disabled={!ready}
                  onClick={() => {
                    setAllyAction(null);
                    setCommand(command === 'items' ? null : 'items');
                  }}
                >
                  <FlaskConical size={18} />
                  <span>Items</span>
                  <kbd>4</kbd>
                </button>
              </div>
              <div className="special-actions">
                <button
                  disabled={!ready || active.overdrive < 100}
                  title={
                    active.overdrive < 100
                      ? `Build your gauge to 100% (${active.overdrive}% ready)`
                      : 'Unleash a powerful attack on all fiends'
                  }
                  onClick={() => act({ type: 'overdrive', targetId: selectedEnemy?.id })}
                >
                  <Flame size={14} />
                  Overdrive<small>{active.overdrive}%</small>
                </button>
                <button
                  disabled={!ready || game.summonUsed || active.id !== 'lyra'}
                  title={
                    game.summonUsed
                      ? 'Available once each encounter'
                      : active.id !== 'lyra'
                        ? 'Available on Lyra’s turn'
                        : 'Call the sea spirit Auralis'
                  }
                  onClick={() => act({ type: 'summon' })}
                >
                  <Moon size={14} />
                  Summon
                  <span className="tiny-diamond" />
                </button>
              </div>
            </div>
            <div className="party-panel">
              <div className="section-label">
                <span>YOUR GUARDIANS</span>
                <span className="party-count">
                  3 COMPANIONS
                  <span className="small-diamond" />
                  ONE JOURNEY
                </span>
              </div>
              <div className="party-cards">
                {game.party.map((hero) => (
                  <article
                    key={hero.id}
                    className={`hero-card ${hero.id === active.id && inBattle ? 'is-active' : ''} ${hero.hp <= 0 ? 'fallen' : ''}`}
                    style={{ '--hero-color': hero.color } as CSSProperties}
                  >
                    <div className="hero-card-top">
                      <span className="hero-role">{hero.role}</span>
                      {hero.id === active.id && inBattle ? (
                        <span className="active-turn">YOUR TURN</span>
                      ) : (
                        <span className="hero-level">LV. {1 + game.upgrades[hero.id].length}</span>
                      )}
                    </div>
                    <div className="hero-main">
                      <div className="hero-portrait">
                        <img
                          src={`${import.meta.env.BASE_URL}portraits/${hero.id}.svg`}
                          alt={`${hero.name}, ${hero.role}`}
                        />
                        <span className="portrait-ring" />
                      </div>
                      <div className="hero-stats">
                        <h3>{hero.name}</h3>
                        <div className="stat-label">
                          <span>HP</span>
                          <strong>
                            {hero.hp}
                            <small> / {hero.maxHp}</small>
                          </strong>
                        </div>
                        <div className={`stat-bar hp ${hero.hp / hero.maxHp < 0.3 ? 'low' : ''}`}>
                          <i style={{ width: `${percentage(hero.hp, hero.maxHp)}%` }} />
                        </div>
                        <div className="stat-label mp-label">
                          <span>MP</span>
                          <strong>
                            {hero.mp}
                            <small> / {hero.maxMp}</small>
                          </strong>
                        </div>
                        <div className="stat-bar mp">
                          <i style={{ width: `${percentage(hero.mp, hero.maxMp)}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="overdrive-row">
                      <Flame size={10} />
                      <span>OVERDRIVE</span>
                      <div className="overdrive-bar">
                        <i style={{ width: `${hero.overdrive}%` }} />
                      </div>
                      <strong>{hero.overdrive}%</strong>
                    </div>
                    {hero.hp <= 0 && (
                      <div className="fallen-label">Fallen · use Phoenix Feather</div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
          <footer className="page-footer">
            <span>
              <Sun size={13} />
              Take your time. The world can wait.
            </span>
            <button onClick={() => setPanel('help')}>
              <kbd>1</kbd>–<kbd>4</kbd> to act<span className="footer-dot">·</span>
              <kbd>←</kbd>
              <kbd>→</kbd> to target
              <CircleHelp size={13} />
            </button>
            <button className="settings-link" onClick={() => setPanel('settings')}>
              Game settings
            </button>
          </footer>
        </div>
      </main>

      {panel === 'journey' && (
        <Modal title="Follow the horizon." eyebrow="YOUR PILGRIMAGE" onClose={closePanel} wide>
          <p className="modal-intro">
            From the sunlit shallows to the heart of the tide. Three places, one promise.
          </p>
          <div className="journey-map">
            <div className="map-sea-lines" />
            <div className="map-route" />
            {locations.map((place, index) => (
              <div
                key={place.place}
                className={`map-stop stop-${index} ${index <= game.encounterIndex ? 'discovered' : ''}`}
              >
                <div className="map-island">
                  <place.icon size={30} />
                  {index < game.encounterIndex || game.phase === 'ending' ? (
                    <span className="map-completed">
                      <Check size={12} />
                    </span>
                  ) : index === game.encounterIndex ? (
                    <span className="map-you">YOU ARE HERE</span>
                  ) : null}
                </div>
                <span className="eyebrow">CHAPTER {place.chapter}</span>
                <h3>{place.place}</h3>
                <span className="map-status">
                  {index < game.encounterIndex || game.phase === 'ending'
                    ? 'A promise kept'
                    : index === game.encounterIndex
                      ? 'Your story continues'
                      : 'Beyond the horizon'}
                </span>
              </div>
            ))}
          </div>
          <div className="journey-detail">
            <div>
              <span className="eyebrow">THE CURRENT CHAPTER</span>
              <h3>{location.name}</h3>
              <p>{location.description}</p>
            </div>
            <button className="primary-button" onClick={closePanel}>
              Return to the journey
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}

      {panel === 'grid' && (
        <Modal
          title="A little stronger, together."
          eyebrow="THE CONSTELLATION GRID"
          onClose={closePanel}
          wide
        >
          <div className="grid-intro">
            <p className="modal-intro">
              Turn experience into possibility. Unlock each guardian’s path with the AP you earn in
              battle.
            </p>
            <span className="ap-badge">
              <Sparkles size={16} />
              <strong>{game.ap}</strong> AP available
            </span>
          </div>
          <div className="hero-tabs" role="tablist" aria-label="Choose guardian">
            {game.party.map((hero) => (
              <button
                key={hero.id}
                role="tab"
                aria-selected={gridHero === hero.id}
                onClick={() => setGridHero(hero.id)}
              >
                <img src={`${import.meta.env.BASE_URL}portraits/${hero.id}.svg`} alt="" />
                {hero.name}
                <span>{hero.role}</span>
              </button>
            ))}
          </div>
          <div className="constellation">
            <div className="constellation-stars" />
            <svg
              className="grid-lines"
              viewBox="0 0 700 200"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M 90 105 C 190 105 155 65 265 65 S 360 140 430 140 S 520 80 610 80" />
            </svg>
            <div className="root-star">
              <img src={`${import.meta.env.BASE_URL}portraits/${gridHero}.svg`} alt="" />
              <span>{currentHero.name}</span>
            </div>
            {UPGRADE_NODES.map((node, index) => {
              const learned = game.upgrades[gridHero].includes(node.id);
              const previousLearned =
                index === 0 || game.upgrades[gridHero].includes(UPGRADE_NODES[index - 1].id);
              const affordable = game.ap >= node.cost;
              return (
                <button
                  key={node.id}
                  className={`growth-node node-${index} ${learned ? 'learned' : ''} ${previousLearned && !learned ? 'available' : ''}`}
                  disabled={
                    busy ||
                    game.phase === 'defeat' ||
                    game.phase === 'ending' ||
                    learned ||
                    !previousLearned ||
                    !affordable
                  }
                  title={
                    learned
                      ? 'Already learned'
                      : !previousLearned
                        ? 'Learn the previous ability first'
                        : !affordable
                          ? 'Earn more AP in battle'
                          : `Learn ${node.name}: ${node.description}`
                  }
                  onClick={() => {
                    const upgraded = upgradeHero(game, gridHero, node.id);
                    if (upgraded !== game) {
                      setGame(upgraded);
                      setToast(`${currentHero.name} learned ${node.name}.`);
                      sound.current.play('heal');
                    }
                  }}
                >
                  <span className="node-orb">
                    {learned ? (
                      <Check size={20} />
                    ) : index === 0 ? (
                      <Heart size={20} />
                    ) : index === 1 ? (
                      <Sword size={20} />
                    ) : (
                      <Sparkles size={20} />
                    )}
                  </span>
                  <strong>{node.name}</strong>
                  <span className="node-description">{node.description.split(' and ')[0]}</span>
                  <small>{learned ? 'LEARNED' : `${node.cost} AP`}</small>
                </button>
              );
            })}
          </div>
          <div className="grid-description">
            <span>
              <Sparkles size={20} />
            </span>
            <div>
              <h3>Every small step leaves a mark.</h3>
              <p>
                {heroDescriptions[gridHero]} Unlock nodes from left to right to improve vitality,
                strength, and magic.
              </p>
            </div>
          </div>
        </Modal>
      )}

      {panel === 'journal' && (
        <Modal
          title="Stories worth keeping."
          eyebrow="THE PILGRIM’S JOURNAL"
          onClose={closePanel}
          wide
        >
          <div className="journal-tabs">
            <button
              className={journalTab === 'story' ? 'selected' : ''}
              onClick={() => setJournalTab('story')}
            >
              Our story
            </button>
            <button
              className={journalTab === 'log' ? 'selected' : ''}
              onClick={() => setJournalTab('log')}
            >
              Battle record<span>{game.log.length}</span>
            </button>
          </div>
          {journalTab === 'story' ? (
            <div className="story-content">
              <span className="story-dropcap">T</span>
              <p>
                he tide has stopped singing. For a hundred years, the islands of Solmere lived by
                the rhythm of the sea. Now the waters are restless, old paths are waking, and the
                lighthouse at the end of the world has gone dark.
              </p>
              <p>
                Lyra believes the answer lies in the Temple of the Tides. Kael has promised to see
                her there. Rook came along because, in his words, “someone ought to take notes.”
              </p>
              <blockquote>
                “We don’t have to save the whole world today.
                <br />
                We just have to take the next step.”<cite>— Kael, on the morning they left</cite>
              </blockquote>
              <div className="journal-heroes">
                {game.party.map((hero) => (
                  <div key={hero.id}>
                    <img src={`${import.meta.env.BASE_URL}portraits/${hero.id}.svg`} alt="" />
                    <h3>{hero.name}</h3>
                    <p>{heroDescriptions[hero.id]}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="full-log" role="log">
              {game.log.map((entry, index) => (
                <div key={`${game.log.length}-${index}`}>
                  <span>{String(game.log.length - index).padStart(2, '0')}</span>
                  <p>{entry}</p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {panel === 'help' && (
        <Modal title="Find your rhythm." eyebrow="A GUARDIAN’S FIELD GUIDE" onClose={closePanel}>
          <p className="modal-intro">
            Tideborn is a turn-based adventure. Nothing happens until you choose your next move.
          </p>
          <div className="help-list">
            <div>
              <Swords />
              <span>
                <h3>Take a turn</h3>
                <p>
                  Attack, use a skill, guard, or use an item. The timeline shows who acts next.
                  Select a fiend in the scene to change your target.
                </p>
              </span>
            </div>
            <div>
              <Zap />
              <span>
                <h3>Know your enemy</h3>
                <p>
                  The small symbol beside each fiend shows its weakness. Rook’s elemental spells can
                  turn a difficult fight in your favor.
                </p>
              </span>
            </div>
            <div>
              <Heart />
              <span>
                <h3>Look after each other</h3>
                <p>
                  Lyra can heal. Potions restore HP, ethers restore MP, and Phoenix Feathers revive
                  fallen allies. Guard to reduce incoming damage.
                </p>
              </span>
            </div>
            <div>
              <Flame />
              <span>
                <h3>Make a little magic</h3>
                <p>
                  Acting and taking damage fills Overdrive. At 100%, unleash a special attack. On
                  Lyra’s turn, summon Auralis once per encounter.
                </p>
              </span>
            </div>
            <div>
              <Sparkles />
              <span>
                <h3>Grow along the way</h3>
                <p>
                  Earn AP from victories and spend it in the Constellation Grid. Clear all three
                  chapters to finish the pilgrimage. Progress saves in this browser.
                </p>
              </span>
            </div>
          </div>
          <div className="keyboard-guide">
            <span>
              <kbd>1</kbd> Attack
            </span>
            <span>
              <kbd>2</kbd> Skills
            </span>
            <span>
              <kbd>3</kbd> Guard
            </span>
            <span>
              <kbd>4</kbd> Items
            </span>
            <span>
              <kbd>Esc</kbd> Close
            </span>
          </div>
          <button className="primary-button full-width" onClick={closePanel}>
            I’m ready
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}

      {panel === 'settings' && (
        <Modal title="Make yourself at home." eyebrow="GAME SETTINGS" onClose={closePanel}>
          <div className="setting-row">
            <div>
              <h3>Soundscape & effects</h3>
              <p>An original ambient chord, and a little magic.</p>
            </div>
            <button
              className={`toggle ${!muted ? 'enabled' : ''}`}
              role="switch"
              aria-checked={!muted}
              aria-label="Soundscape and effects"
              onClick={toggleSound}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <h3>Local autosave</h3>
              <p>
                {saved
                  ? 'Your progress is saved after every turn on this browser.'
                  : 'Storage is unavailable. Progress lasts for this session.'}
              </p>
            </div>
            <Check size={18} />
          </div>
          <div className="restart-setting">
            <h3>A fresh beginning</h3>
            <p>Start the pilgrimage again. This replaces your current saved journey.</p>
            {resetConfirm ? (
              <div className="reset-confirm">
                <span>Leave this journey behind?</span>
                <button className="danger-button" onClick={newJourney}>
                  Yes, start over
                </button>
                <button className="text-button" onClick={() => setResetConfirm(false)}>
                  Keep playing
                </button>
              </div>
            ) : (
              <button className="secondary-button" onClick={() => setResetConfirm(true)}>
                <RotateCcw size={14} />
                New journey
              </button>
            )}
          </div>
          <p className="settings-credit">
            TIDEBORN · An original tribute to the golden age of turn-based RPGs.
            <br />
            Original characters, world, artwork, and music. Built for the browser.
          </p>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Sparkles size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
