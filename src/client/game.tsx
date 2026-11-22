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
import { submitScore, isPreviewMode } from './dailyState';
import {
  refreshCampaignProgress,
  recordCampaignCompletion,
  getCampaignProgress,
  subscribeCampaignProgress,
} from './campaignProgress';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import './index.css';
const pad = (v: number) => String(v).padStart(2, '0');
const prices = [0, 10, 15, 25];
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
  if (level.mode === 'daily') {
    const parts = [...dailyLayout(new Date(level.date)).solution];
    for (const n of [0, 3]) {
      const pair = parts[n];
      if (pair) grid[pair[0]] = { ...pair[1], fixed: 'none' };
    }
  }
  return grid;
}
function load(level: DailyLevel, key: string) {
  const base = initial(level);
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (
      saved &&
      Number.isSafeInteger(saved.hints) &&
      saved.hints >= 0 &&
      Array.isArray(saved.grid) &&
      saved.grid.length === base.length &&
      base.every((p, i) => {
        const s = saved.grid[i];
        return (
          s &&
          p.fixed === s.fixed &&
          [0, 1, 2, 3].includes(s.type) &&
          [0, 1, 2, 3].includes(s.rotation)
        );
      })
    )
      return {
        grid: saved.grid as Placement[],
        hints: Number(saved.hints),
        finished: saved.finished === true,
      };
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
function Workbench({
  level,
  change,
}: {
  level: DailyLevel;
  change: (l: DailyLevel) => void;
}) {
  const daily = level.mode === 'daily',
    key = `dc:bench:3:${level.date}`;
  const [saved] = useState(() => load(level, key));
  const [grid, setGrid] = useState(saved.grid),
    [hints, setHints] = useState(saved.hints),
    [finished, setFinished] = useState(saved.finished);
  const [tool, setTool] = useState(1),
    [history, setHistory] = useState<Placement[][]>([]),
    [modal, setModal] = useState(''),
    [sound, setSound] = useState(getSoundEnabled),
    [notice, setNotice] = useState(''),
    [shareText, setShareText] = useState('');
  const [openedAt] = useState(() => Date.now());
  const started = useRef(openedAt);
  const result = useMemo(
    () => evaluate(level, grid, hints * 5),
    [level, grid, hints]
  );
  const met = result.receivers.filter((r) => r.met).length;
  const grade =
    result.totalCost <= level.targetCost
      ? 'S'
      : result.totalCost <= level.targetCost * 1.15
        ? 'A'
        : result.totalCost <= level.targetCost * 1.3
          ? 'B'
          : 'C';
  const progress = useSyncExternalStore(
    subscribeCampaignProgress,
    getCampaignProgress
  );
  const unlocked =
    progress.status === 'ready' ? progress.data.unlockedThrough + 1 : 1;
  const isWin = met === level.targets.length && !result.hazardPowered;
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ grid, hints, finished }));
    } catch {
      /* Private browsing. */
    }
  }, [key, grid, hints, finished]);
  function apply(next: Placement[], charged = hints) {
    setHistory((h) => [...h.slice(-79), grid]);
    setGrid(next);
    setHints(charged);
    const r = evaluate(level, next, charged * 5);
    const count = r.receivers.filter((v) => v.met).length;
    if (!r.hazardPowered && count === level.targets.length) {
      setFinished(true);
      setModal('win');
      playSound('win');
      if (daily) {
        void submitScore({
          levelId: 31,
          cost: r.totalCost,
          targetCost: level.targetCost,
          parts: next.filter((p) => p.fixed === 'none' && p.type > 0).length,
          hintsUsed: charged,
          durationSeconds: Math.floor((Date.now() - started.current) / 1000),
        });
      } else
        void recordCampaignCompletion(
          level.id,
          r.totalCost <= level.targetCost
            ? 'S'
            : r.totalCost <= level.targetCost * 1.15
              ? 'A'
              : r.totalCost <= level.targetCost * 1.3
                ? 'B'
                : 'C'
        );
    } else if (r.hazardPowered) {
      playSound('hazard');
      setNotice('Overload! Disconnect the hazard.');
    } else if (count > met) {
      playSound('receiver');
      setNotice('Receiver online!');
    }
  }
  function tap(i: number) {
    const p = grid[i];
    if (!p) return;
    if (isWin) {
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
    setGrid(initial(level));
    setHints(0);
    setHistory([]);
    setFinished(false);
    setNotice('Fresh board. Ready to route.');
    setModal('');
    started.current = Date.now();
  }
  function hint() {
    if (isWin) return;
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
    const s = route.get(idx)!;
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
  }
  async function share() {
    const rows = Array.from({ length: level.size }, (_, y) =>
      grid
        .slice(y * level.size, (y + 1) * level.size)
        .map((p, x) =>
          p.fixed === 'source'
            ? 'ϟ'
            : p.fixed === 'target'
              ? '◆'
              : result.voltages.has(y * level.size + x)
                ? '■'
                : '·'
        )
        .join(' ')
    );
    const text = `Daily Circuit · ${level.date}\nRank ${grade} | ${result.totalCost}/${level.targetCost} cost | ${hints} hints\n${rows.join('\n')}`;
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
    setModal('');
    change(l);
  };
  const date = new Date(daily ? level.date : openedAt);
  const id = daily
    ? String(Math.floor(date.getTime() / 86400000) % 1000).padStart(3, '0')
    : pad(level.id);
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
            <CalendarDays />
            {date
              .toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit',
                year: 'numeric',
                timeZone: 'UTC',
              })
              .toUpperCase()}
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
                {[
                  ['source', 'Core'],
                  ['target', 'Receiver'],
                  ['booster', 'Booster'],
                  ['hazard', 'Hazard'],
                ].map(([k, label]) => (
                  <span key={k}>
                    <b className={'key-icon ' + k}>
                      <Device kind={k!} />
                    </b>
                    {label}
                  </span>
                ))}
              </div>
            </section>
          </aside>
          <section className="center" aria-label="Circuit board">
            <div className="hud">
              {[
                [Coins, 'Cost', result.totalCost],
                [Target, 'Target', level.targetCost],
                [Radio, 'Receivers', `${met}/${level.targets.length}`],
              ].map((_, i) => {
                const Icon = [Coins, Target, Radio][i]!;
                return (
                  <div key={i}>
                    <label>
                      <Icon />
                      {String(_[1])}
                    </label>
                    <strong>{String(_[2])}</strong>
                  </div>
                );
              })}
            </div>
            <Board level={level} grid={grid} result={result} onCell={tap} />
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
                disabled={!history.length || isWin}
                onClick={() => {
                  setGrid(history[history.length - 1]!);
                  setHistory(history.slice(0, -1));
                  setNotice('Last move undone.');
                }}
              >
                <Undo2 /> Undo
              </button>
              <button onClick={() => setModal('reset')}>
                <RotateCcw /> Reset
              </button>
              <button className="hint" disabled={isWin} onClick={hint}>
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
                  : 'Circuit complete!'
          }
          close={() => setModal('')}
        >
          {modal === 'help' ? (
            <>
              <p>
                Connect the yellow 5V Core to every green Receiver. The number
                on each Receiver is the minimum voltage it needs.
              </p>
              <ol>
                <li>
                  Choose a part and tap an empty socket. Tap the same part again
                  to rotate it.
                </li>
                <li>
                  Power drops 1V each step. Boosters recharge it to 5V; touching
                  a hazard overloads the board.
                </li>
                <li>
                  Match or beat the target for S rank. Within 15% earns A,
                  within 30% earns B, otherwise C. Each hint adds 5 cost.
                </li>
              </ol>
              <button className="primary" onClick={() => setModal('')}>
                Back to the bench <ChevronRight />
              </button>
            </>
          ) : modal === 'sectors' ? (
            <>
              <p>Clear a sector to unlock the next workbench.</p>
              <div className="sector-grid">
                {getCampaignLevels().map((l) => (
                  <button
                    key={l.id}
                    disabled={l.id > unlocked}
                    onClick={() => jump(l)}
                  >
                    {l.id > unlocked ? <LockKeyhole /> : <Zap />}
                    {pad(l.id)}{' '}
                    {progress.status === 'ready' &&
                      progress.data.bestGrades[l.id]}
                  </button>
                ))}
              </div>
            </>
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
              <div className="win-badge">{grade}</div>
              <p>
                All {met} receivers online. Final cost <b>{result.totalCost}</b>{' '}
                / {level.targetCost}.
              </p>
              <button className="primary" onClick={() => void share()}>
                <Check /> Share result
              </button>
              <button
                className="secondary"
                onClick={() =>
                  daily || level.id === 30
                    ? openSectors()
                    : jump(getCampaignLevels()[level.id]!)
                }
              >
                {daily || level.id === 30 ? 'Explore campaign' : 'Next level'}{' '}
                <ChevronRight />
              </button>
              <p aria-live="polite">{notice}</p>
              {shareText && (
                <textarea
                  readOnly
                  aria-label="Shareable circuit"
                  value={shareText}
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
  return <Workbench key={level.date} level={level} change={change} />;
}
createRoot(document.getElementById('root')!).render(<App />);
