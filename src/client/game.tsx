import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  Zap,
  Volume2,
  VolumeX,
  BookOpen,
  CalendarDays,
  Layers,
  Undo2,
  RotateCcw,
  Lightbulb,
  SlidersHorizontal,
  ClipboardList,
  CircleHelp,
  Radio,
  Target,
  Coins,
  X,
  LockKeyhole,
  Check,
  MousePointer2,
  ChevronRight,
} from 'lucide-react';
import {
  getDailyLevel,
  getCampaignLevels,
  dailyLayout,
  type DailyLevel,
} from './puzzles';
import { evaluate, type Placement } from './rules';
import { solve } from './solver';
import { Board } from './board';
import { Part, Device } from './parts';
import { names } from './rules';
import { playSound, getSoundEnabled, setSoundEnabled } from './audio';
import {
  getDailyState,
  isPreviewMode,
  submitScore,
  subscribeDailyState,
} from './dailyState';
import {
  refreshCampaignProgress,
  recordCampaignCompletion,
  getCampaignProgress,
  subscribeCampaignProgress,
} from './campaignProgress';
import { saveVictoryCard } from './victoryCard';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './index.css';
const pad = (v: number) => String(v).padStart(2, '0');
const DAILY_LAUNCH_DAY = Date.UTC(2026, 10, 23);
const dailyChallengeNumber = (date: Date): number => {
  const dateAtUtcMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return Math.max(1, Math.floor((dateAtUtcMidnight - DAILY_LAUNCH_DAY) / 86400000) + 1);
};
const prices = [0, 10, 15, 25];
const gradeForCost = (cost: number, target: number): 'S' | 'A' | 'B' | 'C' =>
  cost <= target
    ? 'S'
    : cost <= target * 1.15
      ? 'A'
      : cost <= target * 1.3
        ? 'B'
        : 'C';
const gradeOrder = { S: 0, A: 1, B: 2, C: 3 };
const campaignChapters = [
  { id: 1, title: 'I · First Current', description: 'Learn the flow · Sectors 01–10' },
  { id: 2, title: 'II · Voltage Lab', description: 'Boost and branch · Sectors 11–20' },
  { id: 3, title: 'III · Live Wires', description: 'Master the board · Sectors 21–30' },
  { id: 4, title: 'IV · Deep Circuit', description: 'Route under pressure · Sectors 31–40' },
  { id: 5, title: 'V · Grid Architect', description: 'Build the final network · Sectors 41–50' },
] as const;
const boardKeyItems = [
  { kind: 'source', label: 'Core' },
  { kind: 'target', label: 'Receiver' },
  { kind: 'booster', label: 'Booster' },
  { kind: 'hazard', label: 'Hazard' },
] as const;
const quips = {
  idle: [
    "Coffee's hot, soldering iron's hotter.",
    "Let's wire this before my warranty expires.",
    "I was promised a snack break after this circuit.",
    "Tiny wires, enormous responsibility.",
    'The board looks oddly confident. I respect that.',
    'I checked the wiring manual. It was mostly doodles.',
    'New plan: route, glow, look brilliant.',
    'Some robots dream of oil. I dream of clean traces.',
    'Solder check. Spark check. We are emotionally ready.',
    'The shortest route is usually cleverer than it looks.',
  ],
  chaos: [
    'Are we powering one receiver or the entire city?',
    "That's a LOT of splitters. Bold strategy.",
    'My budget meter is crying right now.',
    'At this rate, the wires need their own wires.',
    'My spreadsheet just filed a complaint.',
    'We may have accidentally invented a small power grid.',
    'That is not efficiency. That is circuitry with confidence.',
    'Bold wiring! Slightly expensive wiring.',
    'The target cost is waving a tiny white flag.',
    'Every extra splitter has a part in this malfunction.',
  ],
  hazard: [
    'ABORT! That red skull is spicy!',
    'Congrats, you invented smoke.',
    'My circuits are tingling and NOT in a good way.',
    'That hazard has terrible workplace manners.',
    'Red skull connected. Red alarm activated.',
    'The hazard says hello! We do not say hello back.',
    'We have achieved maximum dramatic danger.',
    'Please tell the smoke that it is not invited.',
    'That circuit has entered its villain era.',
    'Nope! Nope! The spicy red tile wins this round.',
  ],
  receiver: [
    'Boom! One receiver awake!',
    'Pure voltage poetry.',
    'A little current, a lot of applause!',
    'That receiver is positively glowing!',
    'Green light, no problem.',
    'Voltage has entered the chat.',
    'Receiver online. I will try to act casual.',
    'That was one beautifully powered connection.',
    'Look at that glow. Showtime!',
    'The grid approves of our tiny electrical decisions.',
  ],
  hint: [
    'No shame in the +5 shortcut.',
    'A tiny hint never hurt a circuit.',
    'Consider it consulting from your favorite robot.',
    'The hint is a tool, not a personality flaw.',
    'Five credits for a second pair of robot eyes.',
    'Even geniuses appreciate a breadcrumb.',
    'Call it expert guidance from Spark Inc.',
    'A shortcut? I prefer "alternative solution."',
  ],
  undo: [
    "Ctrl+Z is my favorite engineering tool too.",
    'Undo: the official button for "that was a test."',
    'No worries. Even robots misplace a wire.',
    'Reversing engineering is still engineering.',
    'A clean undo is basically time travel.',
    'That tile was just a temporary very bad decision.',
    'We are not stuck. We are revisiting options.',
    'The wire has not forgiven you, but I have.',
  ],
  winS: [
    'S-rank! Even my warranty is impressed.',
    'Flawless! I shall tell the other toasters.',
    'S-rank. The circuit is so clean it reflects light.',
    'Perfect build. My robot applause is fully operational.',
    'Maximum rank, minimum waste. You magnificent engineer.',
    'That route deserves a tiny museum plaque.',
  ],
  winA: [
    'A-rank! So close, my little voltage virtuoso.',
    'Nearly perfect. I will only brag a medium amount.',
    'A-rank: professional, efficient, and mildly shiny.',
    'One polished trace away from legendary.',
    'Excellent work. The S-rank remains annoyingly available.',
    'That is a strong build with excellent paperwork energy.',
  ],
  winB: [
    'B-rank! Function over fashion. Very chic.',
    'Solid work! The budget would like a quick chat.',
    'B-rank: not perfect, but extremely get-it-done.',
    'The receiver is happy. The accountant is suspicious.',
    'A respectable build with a dramatic cost appendix.',
    'We solved it. Optimizing it is future-us territory.',
  ],
  winC: [
    'C-rank! It works, and that is legally a victory.',
    'We made it! Let’s pretend the extra parts were decorative.',
    'C-rank: the smoke stayed mostly inside the circuit.',
    'Victory! It may be inefficient, but it is definitely alive.',
    'The budget has filed for emotional leave.',
    'We did not win elegantly. We won historically.',
    'Congratulations, you unlocked "creative wiring."',
  ],
} as const;
const pickQuip = (lines: readonly string[], previous = ''): string => {
  const options = lines.filter((line) => line !== previous);
  const selected = options[Math.floor(Math.random() * options.length)];
  return selected ?? lines[0] ?? '';
};
const createCircuitShareText = (
  level: DailyLevel,
  grid: readonly Placement[],
  voltages: ReadonlyMap<number, number>,
  grade: 'S' | 'A' | 'B' | 'C',
  cost: number,
  hints: number
): string => {
  const rows = Array.from({ length: level.size }, (_, row) =>
    grid
      .slice(row * level.size, (row + 1) * level.size)
      .map((placement, column) => {
        const index = row * level.size + column;
        if (placement.fixed === 'source') return '⚡';
        if (placement.fixed === 'target') return '🟩';
        if (placement.fixed === 'booster') return '🟦';
        if (placement.fixed === 'hazard') return '🟥';
        if (placement.fixed === 'wall') return '⬛';
        return voltages.has(index) ? '🟨' : '⬜';
      })
      .join('')
  );
  const dailyId = pad(dailyChallengeNumber(new Date(level.date)));
  const title =
    level.mode === 'daily' ? `#${dailyId}` : `· ${level.title}`;

  return (
    `⚡ DAILY CIRCUIT ${title} ⚡\n` +
    `${grade} RANK · ${cost}/${level.targetCost} COST · ${hints} HINTS\n` +
    `${rows.join('\n')}\n` +
    '⚡ Core  🟨 Powered wire  🟩 Receiver  🟦 Booster  🟥 Hazard  ⬛ Wall  ⬜ Empty'
  );
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isPlacement = (value: unknown): value is Placement =>
  isRecord(value) &&
  typeof value.type === 'number' &&
  [0, 1, 2, 3].includes(value.type) &&
  typeof value.rotation === 'number' &&
  [0, 1, 2, 3].includes(value.rotation) &&
  (value.fixed === 'none' ||
    value.fixed === 'source' ||
    value.fixed === 'target' ||
    value.fixed === 'wall' ||
    value.fixed === 'booster' ||
    value.fixed === 'hazard');
function initial(level: DailyLevel): Placement[] {
  const grid = Array.from({ length: level.size ** 2 }, (_, i): Placement => ({
    fixed:
      i === level.source
        ? 'source'
        : level.targets.some((t) => t.index === i)
          ? 'target'
          : level.hazards.includes(i)
            ? 'hazard'
            : level.walls.includes(i)
              ? 'wall'
              : level.boosters.includes(i)
                ? 'booster'
                : 'none',
    type: 0,
    rotation: 0,
  }));
  return grid;
}
function load(level: DailyLevel, key: string) {
  const base = initial(level);
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || 'null');
    if (
      isRecord(saved) &&
      typeof saved.hints === 'number' &&
      Number.isSafeInteger(saved.hints) &&
      saved.hints >= 0 &&
      Array.isArray(saved.grid) &&
      saved.grid.length === base.length
    ) {
      const restoredGrid = saved.grid.filter(isPlacement);
      if (
        restoredGrid.length === saved.grid.length &&
        base.every((placement, index) => restoredGrid[index]?.fixed === placement.fixed)
      ) {
        return {
          grid: restoredGrid,
          hints: saved.hints,
          finished: saved.finished === true,
        };
      }
    }
  } catch {
    /* Optional device storage. */
  }
  return { grid: base, hints: 0, finished: false };
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close}>
      <div className="dialog-head">
        <span className="micro">DAILY CIRCUIT / FIELD MANUAL</span>
        <button className="mini" onClick={close} aria-label="Close">
          <X />
        </button>
      </div>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
function OpeningScreen({
  onPlay,
  onCampaign,
  onGuide,
  onTelemetry,
}: {
  onPlay: () => void;
  onCampaign: () => void;
  onGuide: () => void;
  onTelemetry: () => void;
}) {
  const dailyLevel = getDailyLevel();
  const [greeting, setGreeting] = useState(() => pickQuip(quips.idle));
  const dailySnapshot = useSyncExternalStore(subscribeDailyState, () =>
    getDailyState(1)
  );
  useEffect(() => {
    const timer = window.setInterval(() => {
      setGreeting((previous) => pickQuip(quips.idle, previous));
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);
  const streak =
    dailySnapshot.status === 'ready'
      ? dailySnapshot.data.playerStats.streak
      : 0;
  const dailyId = pad(dailyChallengeNumber(new Date(dailyLevel.date)));

  return (
    <section className="opening-screen" aria-label="Daily Circuit welcome">
      <div className="opening-traces" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <div className="opening-led"><span /> BENCH POWERING UP</div>
      <div className="opening-mascot-card">
        <img src="/bench-bot.png" alt="Spark, your cheerful workbench robot" />
        <span>SPARK / CHIEF SOLDERER</span>
      </div>
      <div className="opening-greeting">
        “{greeting}”
      </div>
      <div className="opening-title">
        <span className="opening-mark"><Zap fill="currentColor" /></span>
        <div>
          <h1>DAILY CIRCUIT</h1>
          <p>YOUR POCKET-SIZED POWER LAB</p>
        </div>
      </div>
      <div className="opening-meta">
        <span>TODAY’S CHALLENGE <b>#{dailyId}</b></span>
        <button className="streak-chip" onClick={onTelemetry} title="View player telemetry">
          🔥 {streak}d
        </button>
      </div>
      <div className="opening-actions">
        <button className="opening-play" onClick={onPlay}>
          <Zap fill="currentColor" /> PLAY DAILY CHALLENGE
        </button>
        <button className="opening-campaign" onClick={onCampaign}>
          <Layers /> CAMPAIGN SECTORS
        </button>
        <button className="opening-guide" onClick={onGuide}>
          HOW TO PLAY <ChevronRight />
        </button>
      </div>
      <span className="opening-footer">ROUTE THE CURRENT. OWN THE GRID.</span>
    </section>
  );
}
function BootScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const wakeTimer = window.setTimeout(() => setPhase(1), 470);
    const readyTimer = window.setTimeout(() => setPhase(2), 980);
    const finishTimer = window.setTimeout(onComplete, 1400);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onComplete();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(wakeTimer);
      window.clearTimeout(readyTimer);
      window.clearTimeout(finishTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onComplete]);

  const status =
    phase === 0
      ? 'CALIBRATING CORE...'
      : phase === 1
        ? 'WAKING SPARK...'
        : 'READY';

  return (
    <section
      className="boot-screen"
      aria-label="Daily Circuit boot sequence"
      role="button"
      tabIndex={0}
      onClick={onComplete}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onComplete();
      }}
    >
      <div className={`boot-panel phase-${phase}`}>
        <div className="boot-mark"><Zap fill="currentColor" /></div>
        <p className="boot-kicker">DAILY CIRCUIT / POWER-UP</p>
        <h1>BENCH SYSTEMS</h1>
        <div className="boot-mascot">
          <img src="/bench-bot.png" alt="Spark is booting up" />
        </div>
        <div className="boot-voltage"><span>0V</span><span>5V</span></div>
        <div className="boot-charge" aria-label="Charging from zero to five volts">
          <span />
          <i />
        </div>
        <p className="boot-status" aria-live="polite">{status}</p>
        <p className="boot-skip">TAP / CLICK OR PRESS ESC TO SKIP</p>
      </div>
    </section>
  );
}
function Workbench({
  level,
  change,
  launchCampaign = false,
  launchGuide = false,
  launchTelemetry = false,
  onLaunchComplete,
  onGuideComplete,
  onTelemetryComplete,
}: {
  level: DailyLevel;
  change: (l: DailyLevel) => void;
  launchCampaign?: boolean;
  launchGuide?: boolean;
  launchTelemetry?: boolean;
  onLaunchComplete: () => void;
  onGuideComplete: () => void;
  onTelemetryComplete: () => void;
}) {
  const daily = level.mode === 'daily',
    key = `dc:bench:4:${level.date}`;
  const [saved] = useState(() => load(level, key));
  const [grid, setGrid] = useState(saved.grid),
    [hints, setHints] = useState(saved.hints),
    [finished, setFinished] = useState(saved.finished);
  const [tool, setTool] = useState(1),
    [history, setHistory] = useState<Placement[][]>([]),
    [modal, setModal] = useState(() =>
      launchCampaign
        ? 'sectors'
        : launchGuide
          ? 'help'
          : launchTelemetry
            ? 'stats'
            : ''
    ),
    [chapter, setChapter] = useState(1),
    [optimizeMode, setOptimizeMode] = useState(false),
    [sound, setSound] = useState(getSoundEnabled),
    [notice, setNotice] = useState(''),
    [shareText, setShareText] = useState(''),
    [commentary, setCommentary] = useState(() => pickQuip(quips.idle)),
    [streakOverride, setStreakOverride] = useState<number | null>(null);
  const [openedAt] = useState(() => Date.now());
  const started = useRef(openedAt);
  const [completionSeconds, setCompletionSeconds] = useState(0);
  const result = useMemo(
    () => evaluate(level, grid, hints * 5),
    [level, grid, hints]
  );
  const met = result.receivers.filter((r) => r.met).length;
  const grade = gradeForCost(result.totalCost, level.targetCost);
  const progress = useSyncExternalStore(
    subscribeCampaignProgress,
    getCampaignProgress
  );
  const dailySnapshot = useSyncExternalStore(subscribeDailyState, () =>
    getDailyState(1)
  );
  const streak =
    streakOverride ??
    (dailySnapshot.status === 'ready'
      ? dailySnapshot.data.playerStats.streak
      : 0);
  const dailyPlayerStats =
    dailySnapshot.status === 'ready'
      ? dailySnapshot.data.playerStats
      : undefined;
  const campaignGrades =
    progress.status === 'ready'
      ? Object.values(progress.data.bestGrades)
      : [];
  const campaignSolved = campaignGrades.length;
  const dailyRank =
    dailyPlayerStats && dailyPlayerStats.totalPuzzles > 0
      ? dailyPlayerStats.efficiencyRating
      : '—';
  const campaignEfficiency =
    campaignSolved > 0
      ? `${Math.round(
          (campaignGrades.filter((campaignGrade) => campaignGrade === 'S')
            .length /
            campaignSolved) *
            100
        )}%`
      : '—';
  const unlocked =
    progress.status === 'ready' ? progress.data.unlockedThrough + 1 : 1;
  const isWin = met === level.targets.length && !result.hazardPowered;
  const sparkMood = isWin
    ? 'celebrate'
    : result.hazardPowered
      ? 'hazard'
      : met > 0
        ? 'powered'
        : 'idle';
  const sparkLine = commentary;
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ grid, hints, finished }));
    } catch {
      /* Private browsing. */
    }
  }, [key, grid, hints, finished]);
  useEffect(() => {
    if (isWin || result.hazardPowered || met > 0 || modal) return;
    const timer = window.setInterval(() => {
      setCommentary((previous) => pickQuip(quips.idle, previous));
    }, 6500);
    return () => window.clearInterval(timer);
  }, [isWin, result.hazardPowered, met, modal]);
  useEffect(() => {
    if (launchCampaign || launchTelemetry) void refreshCampaignProgress();
  }, [launchCampaign, launchTelemetry]);
  function apply(next: Placement[], charged = hints) {
    setShareText('');
    setHistory((h) => [...h.slice(-79), grid]);
    setGrid(next);
    setHints(charged);
    const r = evaluate(level, next, charged * 5);
    const count = r.receivers.filter((v) => v.met).length;
    if (!r.hazardPowered && count === level.targets.length) {
      const nextGrade = gradeForCost(r.totalCost, level.targetCost);
      const firstCompletion = !finished;
      const improvedRank = gradeOrder[nextGrade] < gradeOrder[grade];
      const durationSeconds = Math.max(
        0,
        Math.floor((Date.now() - started.current) / 1000)
      );
      setCompletionSeconds(durationSeconds);
      setShareText('');
      setCommentary(pickQuip(quips[`win${nextGrade}`], commentary));
      setFinished(true);
      if (firstCompletion || !isWin || improvedRank) {
        setModal('win');
        playSound('win');
        if (typeof navigator !== 'undefined') navigator.vibrate?.(12);
      }
      if (daily && firstCompletion) {
        void submitScore({
          levelId: 1,
          cost: r.totalCost,
          targetCost: level.targetCost,
          parts: next.filter((p) => p.fixed === 'none' && p.type > 0).length,
          hintsUsed: charged,
          durationSeconds,
        }).then(({ streak: nextStreak }) => setStreakOverride(nextStreak));
      } else if (!daily && (firstCompletion || improvedRank))
        void recordCampaignCompletion(
          level.id,
          nextGrade
        );
    } else if (r.hazardPowered) {
      playSound('hazard');
      if (typeof navigator !== 'undefined') navigator.vibrate?.(12);
      setCommentary(pickQuip(quips.hazard, commentary));
      setNotice('Overload! Disconnect the hazard.');
    } else if (count > met) {
      playSound('receiver');
      if (typeof navigator !== 'undefined') navigator.vibrate?.(12);
      setCommentary(pickQuip(quips.receiver, commentary));
      setNotice('Receiver online!');
    } else {
      const splitters = next.filter(
        (placement) => placement.fixed === 'none' && placement.type === 3
      ).length;
      if (r.totalCost > level.targetCost * 1.5 || splitters >= 5) {
        setCommentary(pickQuip(quips.chaos, commentary));
      } else {
        setCommentary(pickQuip(quips.idle, commentary));
      }
    }
  }
  function tap(i: number) {
    const p = grid[i];
    if (!p) return;
    if (isWin && !optimizeMode) {
      setModal('win');
      return;
    }
    if (p.fixed !== 'none') {
      setNotice(
        {
          wall: 'Blocked socket — route around it.',
          source: 'Core online. Sends 5V in every direction.',
          booster: 'Booster restores power to 5V.',
          hazard: 'Hazard! Keep power away.',
          target: `Receiver needs ${level.targets.find((t) => t.index === i)?.voltage}V.`,
        }[p.fixed]
      );
      return;
    }
    if (!tool && !p.type) return;
    const rotate = tool !== 0 && p.type === tool;
    playSound(rotate ? 'rotate' : 'place');
    setNotice('');
    apply(
      grid.map((c, j) =>
        j === i
          ? {
              ...c,
              type: tool,
              rotation: rotate ? (p.rotation + 1) % 4 : tool === 1 ? 1 : 0,
            }
          : c
      )
    );
  }
  function reset() {
    setShareText('');
    setCommentary(pickQuip(quips.idle, commentary));
    setGrid(initial(level));
    setHints(0);
    setHistory([]);
    setFinished(false);
    setCompletionSeconds(0);
    setNotice('Fresh board. Ready to route.');
    setModal('');
    started.current = Date.now();
  }
  function hint() {
    if (isWin && !optimizeMode) return;
    const route = daily
      ? dailyLayout(new Date(level.date)).solution
      : new Map(solve(level)?.map((p, i) => [i, p]));
    const idx = grid.findIndex((p, i) => {
      const s = route.get(i);
      return (
        p.fixed === 'none' &&
        s &&
        s.type > 0 &&
        (s.type !== p.type ||
          (s.type === 1
            ? s.rotation % 2 !== p.rotation % 2
            : s.rotation !== p.rotation))
      );
    });
    if (idx < 0) {
      setNotice('Check for an extra connection to a hazard.');
      return;
    }
    const s = route.get(idx);
    if (!s) return;
    playSound('hint');
    setNotice(
      `Hint fitted at ${String.fromCharCode(65 + Math.floor(idx / level.size))}${(idx % level.size) + 1}. +5 cost.`
    );
    apply(
      grid.map((p, i) =>
        i === idx ? { ...p, type: s.type, rotation: s.rotation } : p
      ),
      hints + 1
    );
    setCommentary(pickQuip(quips.hint, commentary));
  }
  async function share() {
    const text = createCircuitShareText(
      level,
      grid,
      result.voltages,
      grade,
      result.totalCost,
      hints
    );
    setShareText(text);
    setNotice('Your shareable circuit is ready.');
    if (daily && !isPreviewMode()) {
      try {
        const r = await fetch('/api/share-result', { method: 'POST' });
        if (r.ok && (await r.json()).success) {
          setNotice('Result shared to Reddit.');
          return;
        }
      } catch {
        /* Use device sharing outside Reddit. */
      }
    }
    try {
      if (navigator.share && !isPreviewMode() && navigator.onLine) {
        await navigator.share({ text });
        setNotice('Result shared.');
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Circuit copied — paste it anywhere!');
    } catch {
      setShareText(text);
      setNotice('Select and copy your circuit below.');
    }
  }
  const openSectors = () => {
    void refreshCampaignProgress();
    setModal('sectors');
  };
  const jump = (l: DailyLevel) => {
    setShareText('');
    setModal('');
    onLaunchComplete();
    onGuideComplete();
    onTelemetryComplete();
    change(l);
  };
  const closeModal = () => {
    setModal('');
    onLaunchComplete();
    onGuideComplete();
    onTelemetryComplete();
  };
  const nextCampaignId = daily
    ? progress.status === 'ready'
      ? progress.data.unlockedThrough + 1
      : 1
    : level.id + 1;
  const nextCampaignLevel = getCampaignLevels().find(
    (candidate) => candidate.id === nextCampaignId
  );
  const continueCampaign = () => {
    if (nextCampaignLevel) jump(nextCampaignLevel);
    else openSectors();
  };
  const openTelemetry = () => {
    void refreshCampaignProgress();
    setModal('stats');
  };
  const date = new Date(daily ? level.date : openedAt);
  const id = daily
    ? pad(dailyChallengeNumber(date))
    : pad(level.id);
  const elapsedSeconds = completionSeconds;
  const elapsedTime = `${Math.floor(elapsedSeconds / 60)}:${pad(elapsedSeconds % 60)}`;
  return (
    <div className="app">
      <header>
        <div className="head-inner">
          <div className="brand">
            <span className="brand-mark">
              <Zap fill="currentColor" />
            </span>
            DAILY CIRCUIT
          </div>
          <nav>
            <button
              className={daily ? 'active' : ''}
              onClick={() => jump(getDailyLevel())}
            >
              <CalendarDays />
              Daily
            </button>
            <button className={!daily ? 'active' : ''} onClick={openSectors}>
              <Layers />
              Campaign
            </button>
          </nav>
          <div className="header-tools">
            <button
              className="mini"
              aria-label={sound ? 'Mute sound' : 'Enable sound'}
              onClick={() => {
                setSoundEnabled(!sound);
                setSound(!sound);
                if (!sound) playSound('place');
              }}
            >
              {sound ? <Volume2 /> : <VolumeX />}
            </button>
            <button className="help" onClick={() => setModal('help')}>
              <CircleHelp />
              <span>How to play</span>
            </button>
          </div>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <div className="eyebrow">
              <span className="led" /> WORKBENCH ONLINE
            </div>
            <h1>
              {daily ? 'Daily Challenge' : 'Campaign Sector'} <b>#{id}</b>
            </h1>
          </div>
          <div className="date-stamp">
            {date
              .toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit',
                timeZone: 'UTC',
              })
              .toUpperCase()}
            <button
              type="button"
              className="streak-chip"
              title="View player telemetry"
              onClick={openTelemetry}
            >
              🔥 {streak}d
            </button>
          </div>
        </div>
        <div className="desk">
          <aside className="left">
            <section className="card mission">
              <h2>
                <ClipboardList /> Mission brief
              </h2>
              <p>
                Route power from the <strong>Core</strong> to every{' '}
                <strong>Receiver.</strong> Keep your cost low for an S rank.
              </p>
              <div className="bot-art">
                <img
                  src="/bench-bot.png"
                  alt="A yellow robot soldering at the workbench"
                />
                <span>FIG. 01 / SPARK</span>
              </div>
            </section>
            <section className="card key">
              <h2>
                <BookOpen /> Board key
              </h2>
              <div>
                {boardKeyItems.map(({ kind, label }) => (
                  <span key={kind}>
                    <b className={`key-icon ${kind}`}>
                      <Device kind={kind} />
                    </b>
                    {label}
                  </span>
                ))}
              </div>
            </section>
          </aside>
          <section className="center" aria-label="Circuit board">
            <div className="hud">
              <div>
                <label><Coins />Cost</label>
                <strong>{result.totalCost}</strong>
              </div>
              <div>
                <label><Target />Target</label>
                <strong>{level.targetCost}</strong>
              </div>
              <div>
                <label><Radio />Receivers</label>
                <strong>{met}/{level.targets.length}</strong>
              </div>
            </div>
            <div className={`budget-bar rank-${grade.toLowerCase()}`} aria-label={`Current budget rank ${grade}`}>
              <div className="budget-track">
                <span className="budget-s" />
                <span className="budget-a" />
                <span className="budget-b" />
                <i style={{ left: `${Math.min(100, (result.totalCost / (level.targetCost * 1.3)) * 100)}%` }} />
              </div>
              <div className="budget-labels">
                <span>S</span><span>A</span><span>B</span><span>C</span>
                <b>{grade}</b>
              </div>
            </div>
            <div className={`spark-buddy ${sparkMood}`} aria-live="polite">
              <div className="spark-avatar">
                <img src="/bench-bot.png" alt="Spark the workbench robot" />
              </div>
              <span className="spark-speech">{sparkLine}</span>
            </div>
            <div className="board-slot">
              <Board level={level} grid={grid} result={result} onCell={tap} />
            </div>
            <div className="board-foot">
              <span className="led" />
              {result.hazardPowered
                ? 'OVERLOAD'
                : isWin
                  ? 'CIRCUIT COMPLETE'
                  : 'SYSTEM READY'}
              <span>
                {level.size} × {level.size} GRID
              </span>
              {isWin && (
                <button className="board-next" onClick={continueCampaign}>
                  Next <ChevronRight />
                </button>
              )}
            </div>
          </section>
          <aside className="right">
            <section className="card tray">
              <h2>
                <SlidersHorizontal /> Parts tray
              </h2>
              <div className="parts">
                {[1, 2, 3, 0].map((t) => (
                  <button
                    className={tool === t ? 'selected' : ''}
                    key={t}
                    aria-pressed={tool === t}
                    onClick={() => {
                      setTool(t);
                      setNotice('');
                      playSound('rotate');
                    }}
                  >
                    <span className={'part-swatch swatch-' + t}>
                      <Part type={t} />
                    </span>
                    <span>
                      <strong>{names[t]}</strong>
                      <small>{t ? `${prices[t]} cost` : 'Remove tile'}</small>
                    </span>
                    {tool === t && <i />}
                  </button>
                ))}
              </div>
            </section>
            <div className="actions">
              <button
                disabled={!history.length || (isWin && !optimizeMode)}
                onClick={() => {
                  const previous = history[history.length - 1];
                  if (!previous) return;
                  setGrid(previous);
                  setHistory(history.slice(0, -1));
                  setCommentary(pickQuip(quips.undo, commentary));
                  setNotice('Last move undone.');
                }}
              >
                <Undo2 /> Undo
              </button>
              <button onClick={() => setModal('reset')}>
                <RotateCcw /> Reset
              </button>
              <button className="hint" disabled={isWin && !optimizeMode} onClick={hint}>
                <Lightbulb /> Hint <b>+5</b>
              </button>
            </div>
          </aside>
        </div>
        <footer aria-live="polite">
          <MousePointer2 />
          {notice || 'Pick a part, tap to place. Tap again to rotate.'}
        </footer>
      </main>
      {modal && (
        <Modal
          title={
            modal === 'help'
              ? 'How to play'
              : modal === 'sectors'
                ? 'Campaign sectors'
                : modal === 'reset'
                  ? 'Reset this circuit?'
                  : modal === 'stats'
                    ? 'Player telemetry'
                  : 'Circuit complete!'
          }
          close={closeModal}
        >
          {modal === 'help' ? (
            <section className="field-manual">
              <p className="manual-lede">Route the Core to every Receiver. Keep the voltage up, the budget down, and the red tiles very far away.</p>
              <h3><BookOpen /> THE BOARD</h3>
              <div className="manual-grid">
                <div className="manual-item">
                  <span className="manual-tile wire"><Part type={1} rotation={1} /></span>
                  <span><b>Conduit</b><small>Straight-through connection.</small></span>
                </div>
                <div className="manual-item">
                  <span className="manual-tile wire"><Part type={2} /></span>
                  <span><b>Corner</b><small>Turns the current around a corner.</small></span>
                </div>
                <div className="manual-item">
                  <span className="manual-tile wire"><Part type={3} /></span>
                  <span><b>Splitter</b><small>Branches power in three directions.</small></span>
                </div>
                <div className="manual-item">
                  <span className="manual-tile source"><Device kind="source" /><b>5V</b></span>
                  <span><b>5V Core</b><small>Sends power in every direction.</small></span>
                </div>
                <div className="manual-item">
                  <span className="manual-tile target"><Device kind="target" /><b>3V</b></span>
                  <span><b>Receiver</b><small>Deliver at least its marked voltage.</small></span>
                </div>
                <div className="manual-item">
                  <span className="manual-tile booster"><Device kind="booster" /><b>+5V</b></span>
                  <span><b>+5V Booster</b><small>Recharges incoming power to 5V.</small></span>
                </div>
                <div className="manual-item">
                  <span className="manual-tile hazard"><Device kind="hazard" /><b>!</b></span>
                  <span><b>Hazard</b><small>Any power here overloads the board.</small></span>
                </div>
                <div className="manual-item">
                  <span className="manual-tile wall"><i /></span>
                  <span><b>Blocked Wall</b><small>No connections pass through.</small></span>
                </div>
              </div>
              <h3><Zap /> VOLTAGE · −1V PER TILE</h3>
              <div className="voltage-strip decay-demo" aria-label="Voltage drops one volt per tile, from five volts to one volt">
                {[5, 4, 3, 2, 1].map((voltage, index) => (
                  <span className="voltage-step" key={voltage}>
                    <b>{index === 0 ? '⚡ ' : ''}{voltage}V</b>
                    {index < 4 && <i aria-hidden="true">→</i>}
                  </span>
                ))}
                <span className="current-pulse" aria-hidden="true" />
              </div>
              <div className="voltage-strip boost-strip" aria-label="A booster restores power to five volts">
                <span className="voltage-step"><b>1V</b><i aria-hidden="true">→</i></span>
                <span className="voltage-step booster-step"><b>+5V BOOSTER</b><i aria-hidden="true">→</i></span>
                <span className="voltage-step"><b>5V</b></span>
                <span className="boost-flash" aria-hidden="true" />
              </div>
              <h3><MousePointer2 /> CONTROLS</h3>
              <div className="controls-strip" aria-label="Tap to place, tap again to rotate, drag to lay or erase">
                <span className="control-place"><b>TAP</b> Place <MousePointer2 /></span>
                <span className="control-rotate"><b>TAP AGAIN</b> Rotate <Part type={2} /></span>
                <span className="control-drag"><b>DRAG</b> Lay / erase <MousePointer2 /></span>
              </div>
              <h3><Target /> RANK TIERS</h3>
              <div className="manual-ranks">
                <span className="manual-rank rank-s">S ≤ Target</span>
                <span className="manual-rank rank-a">A ≤ +15%</span>
                <span className="manual-rank rank-b">B ≤ +30%</span>
                <span className="manual-rank rank-c">C &gt; +30%</span>
                <span className="manual-rank hint-rank">Hint = +5</span>
              </div>
              <button className="primary" onClick={closeModal}>
                Back to the bench <ChevronRight />
              </button>
            </section>
          ) : modal === 'sectors' ? (
            <>
              <p>Clear sectors in order. Targets show the minimum hardware cost for each workbench.</p>
              <div className="chapter-tabs" role="tablist" aria-label="Campaign chapters">
                {campaignChapters.map((item) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={chapter === item.id}
                    className={chapter === item.id ? 'active' : ''}
                    onClick={() => setChapter(item.id)}
                  >
                    {item.title}
                    <small>{item.description}</small>
                  </button>
                ))}
              </div>
              <div className="sector-grid">
                {getCampaignLevels()
                  .filter((l) => Math.ceil(l.id / 10) === chapter)
                  .map((l) => {
                    const bestGrade =
                      progress.status === 'ready'
                        ? progress.data.bestGrades[l.id]
                        : undefined;
                    return (
                      <button
                        key={l.id}
                        disabled={l.id > unlocked}
                        onClick={() => jump(l)}
                        aria-label={`Sector ${l.id}, target ${l.targetCost}, ${
                          bestGrade ? `best rank ${bestGrade}` : 'not completed'
                        }`}
                      >
                        {l.id > unlocked ? <LockKeyhole /> : <Zap />}
                        <span className="sector-number">{pad(l.id)}</span>
                        <small className="sector-target">TARGET ${l.targetCost}</small>
                        {bestGrade && (
                          <b className={`rank-chip rank-${bestGrade.toLowerCase()}`}>
                            {bestGrade}
                          </b>
                        )}
                      </button>
                    );
                  })}
              </div>
            </>
          ) : modal === 'stats' ? (
            <div className="stats-modal">
              <div className="stats-grid">
                <div className="stats-card">
                  <span className="stats-label">Daily Streak</span>
                  <span className="stats-val">
                    🔥 {streak} <small>days</small>
                  </span>
                </div>
                <div className="stats-card">
                  <span className="stats-label">Sectors Cleared</span>
                  <span className="stats-val">
                    {campaignSolved > 0 ? campaignSolved : '—'}
                    <small> / 50</small>
                  </span>
                </div>
                <div className="stats-card">
                  <span className="stats-label">Daily Efficiency Rating</span>
                  <span
                    className={`stats-val${dailyRank === '—' ? '' : ` rank-${dailyRank.toLowerCase()}`}`}
                  >
                    {dailyRank === '—' ? '—' : `${dailyRank} TIER`}
                  </span>
                </div>
                <div className="stats-card">
                  <span className="stats-label">Campaign S-Rank Rate</span>
                  <span className="stats-val">{campaignEfficiency}</span>
                </div>
              </div>
              <p className="stats-note">
                {campaignSolved + (dailyPlayerStats?.totalPuzzles ?? 0) > 0
                  ? 'Telemetry updates as you complete daily puzzles and campaign sectors.'
                  : 'No solves recorded yet. Complete a puzzle to start your telemetry.'}
              </p>
              <button className="primary" onClick={closeModal}>
                Back to the workbench <ChevronRight />
              </button>
            </div>
          ) : modal === 'reset' ? (
            <>
              <p>
                This clears your placements and hint costs, not your completed
                sectors.
              </p>
              <button className="primary" onClick={reset}>
                Reset board
              </button>
              <button className="secondary" onClick={() => setModal('')}>
                Keep playing
              </button>
            </>
          ) : (
            <>
              <div aria-hidden="true" className="spark-shower">
                {Array.from({ length: 26 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      left: `${(i * 37) % 100}%`,
                      background: ['#ffda57', '#94d1ae', '#b19bd7'][i % 3],
                      animationDelay: `${(i % 8) * 0.06}s`,
                    }}
                  />
                ))}
              </div>
              <div className={`win-badge rank-seal rank-${grade.toLowerCase()}`}>{grade}</div>
              <div className="win-spark">
                <img src="/bench-bot.png" alt="Spark celebrates the completed circuit" />
                <p>{sparkLine}</p>
              </div>
              <p>
                All {met} receivers online. Final cost <b>{result.totalCost}</b>{' '}
                / {level.targetCost}.
              </p>
              <div className="victory-stats" aria-label="Circuit telemetry">
                <div><small>COST / TARGET</small><b>${result.totalCost} / ${level.targetCost}</b></div>
                <div><small>TIME</small><b>{elapsedTime}</b></div>
                <div><small>HINTS</small><b>{hints}</b></div>
                <div><small>RANK</small><b className={`rank-text rank-${grade.toLowerCase()}`}>{grade}</b></div>
              </div>
              <div
                className="victory-diagram"
                style={{ gridTemplateColumns: `repeat(${level.size}, minmax(0, 1fr))` }}
                aria-label="Solved circuit diagram"
              >
                {grid.map((placement, index) => (
                  <span
                    key={index}
                    className={[
                      placement.fixed === 'source'
                        ? 'core'
                        : placement.fixed === 'target'
                          ? 'receiver'
                          : placement.fixed === 'booster'
                            ? 'boost'
                            : placement.fixed === 'hazard'
                              ? 'hazard'
                              : placement.fixed === 'wall'
                                ? 'wall'
                                : result.voltages.has(index) && placement.type > 0
                                  ? 'powered'
                                  : '',
                    ].join(' ')}
                    title={placement.fixed === 'none' ? (placement.type > 0 ? names[placement.type] ?? 'Part' : 'Empty') : placement.fixed}
                  >
                    {placement.fixed === 'source'
                      ? '⚡'
                      : placement.fixed === 'target'
                        ? 'R'
                        : placement.fixed === 'booster'
                          ? '+'
                          : placement.fixed === 'hazard'
                            ? '!'
                            : placement.fixed === 'wall'
                              ? '×'
                              : placement.type > 0 && result.voltages.has(index)
                                ? '·'
                                : ''}
                  </span>
                ))}
              </div>
              <button className="primary progression-primary" onClick={continueCampaign}>
                {daily
                  ? `Play Next Campaign Sector (#${pad(nextCampaignLevel?.id ?? 1)}) →`
                  : nextCampaignLevel
                    ? `Next Sector (#${pad(nextCampaignLevel.id)}) →`
                    : 'Campaign Complete · Map'}
              </button>
              {daily && (
                <button className="secondary" onClick={openSectors}>
                  <Layers /> Explore campaign
                </button>
              )}
              {grade !== 'S' && (
                <button
                  className="secondary"
                  onClick={() => {
                    setOptimizeMode(true);
                    setModal('');
                    setNotice('Optimization mode: the solved board is still yours to tune.');
                  }}
                >
                  <Zap /> Optimize for S-Rank
                </button>
              )}
              <button
                className="secondary"
                onClick={() => {
                  void saveVictoryCard({
                    level,
                    grid,
                    voltages: result.voltages,
                    grade,
                    cost: result.totalCost,
                  }).then(
                    () => setNotice('Victory card copied to the clipboard as a PNG.'),
                    (error: unknown) => {
                      console.error('Unable to save victory poster:', error);
                      setNotice('Could not save the PNG. Please try again.');
                    }
                  );
                }}
              >
                <Check /> Save Card (PNG)
              </button>
              <button className="secondary share-result" onClick={() => void share()}>
                <Check /> Share Result
              </button>
              <p aria-live="polite">{notice}</p>
              {shareText && (
                <textarea
                  readOnly
                  aria-label="Shareable circuit"
                  value={createCircuitShareText(
                    level,
                    grid,
                    result.voltages,
                    grade,
                    result.totalCost,
                    hints
                  )}
                  onFocus={(e) => e.target.select()}
                />
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
export function App() {
  const [level, change] = useState(getDailyLevel);
  const [stage, setStage] = useState<'boot' | 'opening' | 'workbench'>('boot');
  const [launchCampaign, setLaunchCampaign] = useState(false);
  const [launchGuide, setLaunchGuide] = useState(false);
  const [launchTelemetry, setLaunchTelemetry] = useState(false);
  const openWorkbench = (launch: 'play' | 'campaign' | 'guide' | 'telemetry') => {
    setLaunchCampaign(launch === 'campaign');
    setLaunchGuide(launch === 'guide');
    setLaunchTelemetry(launch === 'telemetry');
    setStage('workbench');
  };
  return (
    <>
      <Workbench
        key={`${level.mode}-${level.id}-${level.date}-${launchCampaign}-${launchGuide}-${launchTelemetry}`}
        level={level}
        change={change}
        launchCampaign={launchCampaign}
        launchGuide={launchGuide}
        launchTelemetry={launchTelemetry}
        onLaunchComplete={() => setLaunchCampaign(false)}
        onGuideComplete={() => setLaunchGuide(false)}
        onTelemetryComplete={() => setLaunchTelemetry(false)}
      />
      {stage === 'boot' && <BootScreen onComplete={() => setStage('opening')} />}
      {stage === 'opening' && (
        <OpeningScreen
          onPlay={() => openWorkbench('play')}
          onCampaign={() => openWorkbench('campaign')}
          onGuide={() => openWorkbench('guide')}
          onTelemetry={() => openWorkbench('telemetry')}
        />
      )}
    </>
  );
}
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Daily Circuit root element was not found');
const root = createRoot(rootElement);
root.render(<App />);
if (import.meta.hot) {
  import.meta.hot.dispose(() => root.unmount());
}
