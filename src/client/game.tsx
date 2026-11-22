import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  getSoundEnabled,
  playHazard,
  playHint,
  playPlace,
  playReceiverMet,
  playRotate,
  playWin,
  setSoundEnabled,
} from './audio';
import {
  getCommunityDistribution,
  getDailyState,
  refreshDailyState,
  shareDailyResult,
  submitScore,
  subscribeDailyState,
  type CommunityDistribution,
} from './dailyState';
import {
  getCampaignProgress,
  recordCampaignCompletion,
  refreshCampaignProgress,
  subscribeCampaignProgress,
  type CampaignProgressSnapshot,
} from './campaignProgress';
import {
  DIRECTIONS,
  evaluate,
  BOOSTER_VOLTAGE,
  SOURCE_VOLTAGE,
  type FixedType,
  type Placement,
  type Puzzle,
} from './rules';
import {
  CAMPAIGN_LEVEL_COUNT,
  DAILY_LEVEL_ID,
  getCampaignLevels,
  getDailyLevel,
  getLevelById,
  type DailyLevel,
} from './puzzles';
import { solve } from './solver';
import './index.css';

const GRID_SIZE = 7;
const HINT_COST = 5;

type Grade = 'S' | 'A' | 'B' | 'C';
type CompletedRun = {
  hintsUsed: number;
  finalCost: number;
  targetCost: number;
  nextLevelId: number | null;
  progressError: string | null;
  isDaily: boolean;
  dailyStreak: number | null;
  distribution: CommunityDistribution | null;
  dailyResultSaved: boolean;
  resultError: string | null;
  resultNotice: string | null;
};

type CellState = {
  type: number;
  rotation: number;
  fixed: FixedType;
  requiredVoltage?: number;
};

type HintSuggestion = {
  index: number;
  type: number;
  rotation: number;
  connections: readonly number[];
};

type HintFailure = {
  index: number | null;
  message: string;
};

type SparkParticle = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  age: number;
  lifetime: number;
  radius: number;
  hue: number;
};

const MAX_SPARK_PARTICLES = 120;
const TRAINING_TARGET_COST = 85;
const TRAINING_PUZZLE: Puzzle = {
  size: GRID_SIZE,
  source: 21,
  targets: [{ index: 20, voltage: 1 }],
  boosters: [10],
  walls: [],
  hazards: [24],
};
const TRAINING_ROUTE = [21, 22, 15, 8, 9, 10, 11, 12, 13, 20];

const createSparkBurst = (
  x: number,
  y: number,
  isSurge: boolean
): SparkParticle[] => {
  const amount = isSurge ? 64 : 18;

  return Array.from({ length: amount }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = isSurge ? 100 + Math.random() * 260 : 55 + Math.random() * 150;
    return {
      x,
      y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      age: 0,
      lifetime: isSurge ? 0.35 + Math.random() * 0.45 : 0.22 + Math.random() * 0.28,
      radius: isSurge ? 1.5 + Math.random() * 2.5 : 1 + Math.random() * 1.7,
      hue: Math.random() < 0.78 ? 166 : 39,
    };
  });
};

type Screen = 'boot' | 'menu' | 'levels' | 'tutorial' | 'play' | 'win';
type GoToScreen = (screen: Screen) => void;

type ScreenProps = {
  goTo: GoToScreen;
};

type BootScreenProps = {
  onSkip: () => void;
  onAnimationEnd: () => void;
};

const BootScreen = ({ onSkip, onAnimationEnd }: BootScreenProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSkip();
    }
  };

  return (
    <main
      className="boot-screen-shell"
      aria-label="Daily Circuit boot sequence. Tap or press enter to skip."
      tabIndex={0}
      onClick={onSkip}
      onKeyDown={handleKeyDown}
    >
      <section className="boot-terminal" aria-label="System initialization">
        <div className="boot-terminal-header">
          <span>DC // BIOS v4.02</span>
          <span className="boot-live-indicator">SYSTEM ONLINE</span>
        </div>
        <div className="boot-terminal-lines" aria-live="polite">
          <p className="boot-line">BIOS v4.02 // INITIALIZING NEURAL LINK...</p>
          <p className="boot-line">CHECKING CIRCUIT MEMORY <span>[OK]</span></p>
          <p className="boot-line">SYNCHRONIZING DAILY SECTORS <span>[OK]</span></p>
          <p className="boot-line">ESTABLISHING PILOT CONNECTION <span>[OK]</span></p>
          <p className="boot-line boot-line-ready">ALL SYSTEMS NOMINAL. WELCOME, PILOT.</p>
        </div>
        <div
          className="boot-progress-track"
          role="progressbar"
          aria-label="Neural link initialization"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext="Initializing"
        >
          <span
            className="boot-progress-fill"
            onAnimationEnd={onAnimationEnd}
          />
        </div>
        <div className="boot-footer">
          <span>NEURAL LINK</span>
          <span>CLICK ANYWHERE TO SKIP</span>
        </div>
      </section>
    </main>
  );
};

type MenuScreenProps = ScreenProps & {
  streak: number | undefined;
  onPlayDaily: () => void;
  onOpenLevels: () => void;
};

const MenuScreen = ({ goTo, streak, onPlayDaily, onOpenLevels }: MenuScreenProps) => {
  const dailyLevel = getDailyLevel();
  return (
    <main className="menu-screen-shell">
      <div className="menu-background-grid" aria-hidden="true" />
      <section className="menu-screen-content" aria-labelledby="menu-screen-title">
        <span className="menu-eyebrow">
          DAILY PUZZLE // {dailyLevel.date}
        </span>
        <h1 id="menu-screen-title" className="menu-screen-title">DAILY CIRCUIT</h1>
        <p className="menu-screen-tagline">ROUTE THE CURRENT. OUTSMART THE GRID.</p>
        <div className="menu-streak-panel" aria-label="Daily player streak">
          <span className="menu-streak-icon" aria-hidden="true">✦</span>
          <span className="menu-streak-copy">
            <small>ACTIVE STREAK</small>
            <strong>{streak === undefined ? '—' : `${streak} ${streak === 1 ? 'DAY' : 'DAYS'}`}</strong>
          </span>
          <span className="menu-streak-divider" />
          <span className="menu-streak-copy">
            <small>DAILY TARGET</small>
            <strong>${dailyLevel.targetCost}</strong>
          </span>
        </div>
        <nav className="menu-actions" aria-label="Main menu">
          <ScreenButton onClick={onPlayDaily}>PLAY DAILY</ScreenButton>
          <ScreenButton variant="secondary" onClick={onOpenLevels}>LEVEL SELECT</ScreenButton>
          <ScreenButton variant="secondary" onClick={() => goTo('tutorial')}>TRAINING LEVEL</ScreenButton>
        </nav>
      </section>
    </main>
  );
};

type LevelsScreenProps = ScreenProps & {
  selectedLevel: number;
  levels: DailyLevel[];
  progress: CampaignProgressSnapshot;
  onSelectSector: (levelId: number) => void;
};

const LevelsScreen = ({
  goTo,
  selectedLevel,
  levels,
  progress,
  onSelectSector,
}: LevelsScreenProps) => {
  const dailyLevel = getDailyLevel();
  return (
  <StateScreen name="levels" eyebrow="SECTOR ARCHIVE" title="SELECT A SECTOR">
    <button
      type="button"
      className={`sector-card daily-sector-card ${selectedLevel === DAILY_LEVEL_ID ? 'selected' : ''}`}
      onClick={() => onSelectSector(DAILY_LEVEL_ID)}
    >
      <span className="sector-card-number">UTC DAILY</span>
      <strong>{dailyLevel.date} · TARGET ${dailyLevel.targetCost}</strong>
      <span className="sector-grade">SAME CIRCUIT FOR EVERYONE</span>
    </button>
    {progress.status === 'error' && (
      <p className="campaign-status" role="alert">
        Progress could not be loaded. Sector 01 remains available; retry by reopening this screen.
      </p>
    )}
    {progress.status === 'loading' && (
      <p className="campaign-status" role="status">Syncing Redis campaign progress…</p>
    )}
    <div className="campaign-path" aria-label="30 campaign sectors">
      {levels.map((level) => {
        const unlockedThrough =
          progress.status === 'ready' ? progress.data.unlockedThrough : 0;
        const unlocked = level.id <= unlockedThrough + 1;
        const bestGrade =
          progress.status === 'ready'
            ? progress.data.bestGrades[level.id]
            : undefined;
        return (
          <button
            type="button"
            className={`sector-card ${unlocked ? 'unlocked' : 'locked'} ${selectedLevel === level.id ? 'selected' : ''}`}
            key={level.id}
            aria-pressed={unlocked && selectedLevel === level.id}
            aria-label={`Sector ${level.id}, target $${level.targetCost}, ${unlocked ? `unlocked${bestGrade ? `, best grade ${bestGrade}` : ', no grade yet'}` : 'locked'}`}
            disabled={!unlocked}
            onClick={() => {
              if (unlocked) onSelectSector(level.id);
            }}
          >
            <span className="sector-card-number">{String(level.id).padStart(2, '0')}</span>
            <strong>{level.title}</strong>
            <span className="sector-target">TARGET ${level.targetCost}</span>
            <span className={`sector-grade ${bestGrade ? `grade-${bestGrade.toLowerCase()}` : ''}`}>
              {unlocked ? bestGrade ?? 'UNRANKED' : 'LOCKED'}
            </span>
          </button>
        );
      })}
    </div>
    <ScreenButton variant="secondary" onClick={() => goTo('menu')}>MAIN MENU</ScreenButton>
  </StateScreen>
  );
};

const TutorialScreen = ({ goTo }: ScreenProps) => {
  const [step, setStep] = useState<number>(0);
  const [selectedTool, setSelectedTool] = useState<number>(1);
  const [placements, setPlacements] = useState(() =>
    Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
      if (index === TRAINING_PUZZLE.source) {
        return { type: 4, rotation: 0, fixed: 'source' as const };
      }
      if (TRAINING_PUZZLE.targets.some((target) => target.index === index)) {
        return { type: 4, rotation: 0, fixed: 'target' as const };
      }
      if (TRAINING_PUZZLE.boosters.includes(index)) {
        return { type: 4, rotation: 0, fixed: 'booster' as const };
      }
      if (TRAINING_PUZZLE.hazards.includes(index)) {
        return { type: 4, rotation: 0, fixed: 'hazard' as const };
      }
      return { type: 0, rotation: 0, fixed: 'none' as const };
    })
  );
  const tutorialSteps = [
    {
      title: 'Voltage decay',
      description: 'Each powered trace tile loses 1V. Follow the arrows and watch the live voltage badges fall.',
      highlights: [22, 15, 8, 9],
    },
    {
      title: 'Signal booster',
      description: 'The highlighted booster resets incoming voltage to 5V. Route through it to power the distant receiver.',
      highlights: [10],
    },
    {
      title: 'Overload hazard',
      description: 'A powered hazard shorts the board. The arrows show the safe route around the marked danger cell.',
      highlights: [24],
    },
    {
      title: 'Target budget',
      description: 'Finish for $85 or less for S. Spend up to 15% more for A, up to 30% more for B; otherwise earn C.',
      highlights: [20],
    },
  ];
  const currentStep = tutorialSteps.at(step) ?? {
    title: 'Voltage decay',
    description: 'Each powered trace tile loses 1V. Follow the arrows and watch the live voltage badges fall.',
    highlights: [],
  };
  const evaluation = useMemo(
    () => evaluate(TRAINING_PUZZLE, placements),
    [placements]
  );
  const completed = !evaluation.hazardPowered &&
    evaluation.receivers.every((receiver) => receiver.met);
  const trainingGrade = gradeFor(evaluation.hardwareCost, TRAINING_TARGET_COST);

  const previewVoltages = useMemo(() => {
    const previews = new Map<number, number>();
    for (let index = 0; index < placements.length; index += 1) {
      const current = placements[index];
      if (!current || current.fixed !== 'none' || current.type !== 0) continue;

      let bestVoltage = 0;
      for (let rotation = 0; rotation < 4; rotation += 1) {
        const candidate = [...placements];
        candidate[index] = { type: selectedTool, rotation, fixed: 'none' };
        bestVoltage = Math.max(
          bestVoltage,
          evaluate(TRAINING_PUZZLE, candidate).voltages.get(index) ?? 0
        );
      }
      if (bestVoltage > 0) previews.set(index, bestVoltage);
    }
    return previews;
  }, [placements, selectedTool]);

  const placeTrainingTile = (index: number): void => {
    const cell = placements[index];
    if (!cell || cell.fixed !== 'none' || completed) return;

    const nextPlacements = [...placements];
    if (cell.type === 0) {
      nextPlacements[index] = { type: selectedTool, rotation: 0, fixed: 'none' };
    } else if (cell.type === selectedTool && cell.rotation < 3) {
      nextPlacements[index] = {
        type: cell.type,
        rotation: cell.rotation + 1,
        fixed: 'none',
      };
    } else if (cell.type === selectedTool) {
      nextPlacements[index] = { type: 0, rotation: 0, fixed: 'none' };
    } else {
      nextPlacements[index] = { type: selectedTool, rotation: 0, fixed: 'none' };
    }
    setPlacements(nextPlacements);
    const nextEvaluation = evaluate(TRAINING_PUZZLE, nextPlacements);
    if (
      !completed &&
      !nextEvaluation.hazardPowered &&
      nextEvaluation.receivers.every((receiver) => receiver.met)
    ) {
      playWin();
    } else if (cell.type > 0) {
      playRotate();
    } else {
      playPlace();
    }
  };

  const arrowFor = (index: number): string => {
    const routeIndex = TRAINING_ROUTE.indexOf(index);
    const currentIndex = TRAINING_ROUTE[routeIndex];
    const nextIndex = TRAINING_ROUTE[routeIndex + 1];
    if (routeIndex < 0 || currentIndex === undefined || nextIndex === undefined) {
      return '';
    }
    const difference = nextIndex - currentIndex;
    if (difference === -GRID_SIZE) return '↑';
    if (difference === 1) return '→';
    if (difference === GRID_SIZE) return '↓';
    if (difference === -1) return '←';
    return '';
  };

  return (
    <StateScreen name="tutorial" eyebrow="PILOT TRAINING // INTERACTIVE LEVEL" title="TRAINING CIRCUIT">
      <div className="training-layout">
        <div className={`training-budget ${step === 3 ? 'coach-highlight' : ''}`}>
          <span>SPENT</span>
          <strong>${evaluation.totalCost} <small>/ TARGET ${TRAINING_TARGET_COST}</small></strong>
          <span className={`training-grade grade-${trainingGrade.toLowerCase()}`}>{trainingGrade}</span>
        </div>
        <section className="training-coach" aria-live="polite">
          <span className="training-coach-step">LESSON {step + 1} / {tutorialSteps.length}</span>
          <h2>{currentStep?.title}</h2>
          <p>{currentStep?.description}</p>
        </section>
        <div className={`training-board ${evaluation.hazardPowered ? 'board-overload' : ''}`} role="grid" aria-label="Interactive training circuit">
          {placements.map((cell, index) => {
            const voltage = evaluation.voltages.get(index) ?? 0;
            const receiver = evaluation.receivers.find((result) => result.index === index);
            const previewVoltage = previewVoltages.get(index);
            const isHighlighted = currentStep?.highlights.includes(index) ?? false;
            const isOnRoute = TRAINING_ROUTE.includes(index);
            const arrow = arrowFor(index);
            const label = cell.fixed === 'none'
              ? `${cell.type === 0 ? 'empty' : 'trace'}, ${voltage} volts`
              : cell.fixed;

            return (
              <button
                type="button"
                role="gridcell"
                key={index}
                className={`training-tile ${cell.fixed} ${voltage > 0 ? 'powered' : ''} ${isOnRoute ? 'route-hint' : ''} ${isHighlighted ? 'coach-highlight' : ''}`}
                aria-label={`Training cell ${index + 1}: ${label}${previewVoltage ? `, preview ${previewVoltage} volts` : ''}`}
                aria-disabled={cell.fixed !== 'none'}
                onClick={() => placeTrainingTile(index)}
              >
                {cell.fixed === 'source' && <span className="training-node">⚡<small>5V</small></span>}
                {cell.fixed === 'target' && <span className="training-node">◎<small>NEED {receiver?.requiredVoltage ?? 1}V</small></span>}
                {cell.fixed === 'booster' && <span className="training-node">◈<small>RESET +5V</small></span>}
                {cell.fixed === 'hazard' && <span className="training-node">☢</span>}
                {cell.fixed === 'none' && cell.type > 0 && (
                  <svg className="training-trace-svg" viewBox="0 0 44 44" aria-hidden="true">
                    {(evaluation.connections.get(index) ?? []).map((directionIndex) => {
                      const direction = DIRECTIONS.find(
                        (candidate) => candidate.direction === directionIndex
                      );
                      if (!direction) return null;
                      return (
                        <line
                          key={direction.direction}
                          x1="22"
                          y1="22"
                          x2={22 + direction.column * 22}
                          y2={22 + direction.row * 22}
                        />
                      );
                    })}
                    <circle cx="22" cy="22" r="5" />
                  </svg>
                )}
                {cell.fixed === 'none' && cell.type > 0 && voltage > 0 && (
                  <span className="training-voltage">{voltage}V</span>
                )}
                {cell.fixed === 'none' && cell.type === 0 && previewVoltage !== undefined && (
                  <span className="training-voltage ghost-voltage">~{previewVoltage}V</span>
                )}
                {isOnRoute && arrow && <span className="training-route-arrow" aria-hidden="true">{arrow}</span>}
                {index === 24 && isHighlighted && <span className="training-detour-arrow" aria-hidden="true">↗</span>}
              </button>
            );
          })}
        </div>
        <p className="target-guidance">Target = cheapest known solution. Spend less for a higher rank.</p>
        {evaluation.hazardPowered && (
          <p className="training-error" role="alert">OVERLOAD — clear the route from the hazard and try again.</p>
        )}
        {completed && (
          <div className="training-complete" role="status">
            <strong>TRAINING COMPLETE · GRADE {trainingGrade}</strong>
            <span>All receivers powered without an overload.</span>
            <ScreenButton onClick={() => goTo('play')}>START DAILY CIRCUIT</ScreenButton>
          </div>
        )}
        {!completed && (
          <div className="training-controls">
            <div className="training-palette" aria-label="Select a trace component">
              <button type="button" className={selectedTool === 1 ? 'selected' : ''} onClick={() => setSelectedTool(1)}>CONDUIT</button>
              <button type="button" className={selectedTool === 2 ? 'selected' : ''} onClick={() => setSelectedTool(2)}>VECTOR</button>
              <button type="button" className={selectedTool === 3 ? 'selected' : ''} onClick={() => setSelectedTool(3)}>SPLITTER</button>
            </div>
            <p>Choose a trace, tap an empty cell to place it, then tap it again to rotate.</p>
          </div>
        )}
        <div className="tutorial-step-indicator" aria-label={`Lesson ${step + 1} of ${tutorialSteps.length}`}>
          {tutorialSteps.map((tutorialStep, index) => (
            <button
              type="button"
              key={tutorialStep.title}
              className={`tutorial-step-dot ${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`}
              aria-label={`Show lesson ${index + 1}: ${tutorialStep.title}`}
              aria-pressed={index === step}
              onClick={() => setStep(index)}
            />
          ))}
          <span className="tutorial-step-count">{step + 1} / {tutorialSteps.length}</span>
        </div>
        <div className="tutorial-navigation">
          <button type="button" className="state-screen-button secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>BACK</button>
          <button type="button" className="state-screen-button secondary" onClick={() => goTo('menu')}>EXIT</button>
          <button type="button" className="state-screen-button" onClick={() => setStep((current) => Math.min(tutorialSteps.length - 1, current + 1))} disabled={step === tutorialSteps.length - 1}>NEXT TIP</button>
        </div>
      </div>
    </StateScreen>
  );
};

type WinScreenProps = ScreenProps & {
  hintsUsed: number;
  finalCost: number;
  targetCost: number;
  nextLevelId: number | null;
  progressError: string | null;
  isDaily: boolean;
  dailyStreak: number | null;
  distribution: CommunityDistribution | null;
  dailyResultSaved: boolean;
  resultError: string | null;
  resultNotice: string | null;
  onNextLevel: (levelId: number) => void;
};

const WinScreen = ({
  goTo,
  hintsUsed,
  finalCost,
  targetCost,
  nextLevelId,
  progressError,
  isDaily,
  dailyStreak,
  distribution,
  dailyResultSaved,
  resultError,
  resultNotice,
  onNextLevel,
}: WinScreenProps) => {
  const grade = gradeFor(finalCost, targetCost);
  const [sharing, setSharing] = useState<boolean>(false);
  const [shared, setShared] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const gradeStats = distribution
    ? [
        { grade: 'S', count: distribution.gradeDistribution.sPlus, style: 's-grade' },
        { grade: 'A', count: distribution.gradeDistribution.a, style: 'a-grade' },
        { grade: 'B', count: distribution.gradeDistribution.b, style: 'b-grade' },
        { grade: 'C', count: distribution.gradeDistribution.c, style: 'c-grade' },
      ]
    : [];
  const peakGradeCount = Math.max(1, ...gradeStats.map((item) => item.count));

  const handleShare = async (): Promise<void> => {
    setSharing(true);
    setShareError(null);
    try {
      const result = await shareDailyResult();
      setShared(true);
      setShareNotice(
        result.alreadyShared
          ? 'Your result was already shared to this thread.'
          : 'Your rank and cost were posted to the thread.'
      );
    } catch (error) {
      console.error('Unable to share daily result:', error);
      setShareError(
        error instanceof Error ? error.message : 'Unable to share your result.'
      );
    } finally {
      setSharing(false);
    }
  };

  return (
  <StateScreen name="win" eyebrow="SIGNAL ROUTED" title="CIRCUIT COMPLETE">
    <p>Every receiver is online. Your schematic is locked in.</p>
    <p className={`win-grade grade-${grade.toLowerCase()}`}>GRADE {grade}</p>
    <p className="win-cost">SPENT ${finalCost} / TARGET ${targetCost}</p>
    <p className="win-hints-used">HINTS USED: {hintsUsed}</p>
    {isDaily && (
      <>
        <p className="win-daily-streak">
          DAILY STREAK: {dailyStreak === null ? '—' : `${dailyStreak} ${dailyStreak === 1 ? 'DAY' : 'DAYS'}`}
        </p>
        <div className="histogram-box win-distribution">
          <span className="hist-title">DAILY COMMUNITY EFFICIENCY</span>
          {distribution ? (
            <>
              <div
                className="hist-bars"
                role="img"
                aria-label={`Daily community ranks: ${distribution.gradeDistribution.sPlus} S, ${distribution.gradeDistribution.a} A, ${distribution.gradeDistribution.b} B, ${distribution.gradeDistribution.c} C`}
              >
                {gradeStats.map((item) => (
                  <div className="hist-column" key={item.grade}>
                    <div
                      className={`h-bar ${item.style} ${distribution.playerGrade === item.grade ? 'you' : ''}`}
                      style={{
                        height: `${Math.max(8, item.count / peakGradeCount * 100)}%`,
                      }}
                    >
                      <span>{item.count}</span>
                    </div>
                    <small>{item.grade}</small>
                    {distribution.playerGrade === item.grade && <em>YOU ARE HERE</em>}
                  </div>
                ))}
              </div>
              <p className="distribution-total">{distribution.total} daily clears</p>
            </>
          ) : (
            <p className="histogram-status" role="status">
              Community distribution unavailable.
            </p>
          )}
        </div>
        <button
          type="button"
          className="reddit-submit-btn win-share-button"
          onClick={() => void handleShare()}
          disabled={!dailyResultSaved || sharing || shared}
        >
          {sharing ? 'SHARING…' : shared ? '✓ SHARED' : 'SHARE RESULT'}
        </button>
        {!dailyResultSaved && (
          <p className="submission-error" role="alert">
            Your result could not be saved, so it cannot be shared yet.
          </p>
        )}
        {shareError && <p className="submission-error" role="status">{shareError}</p>}
        {shareNotice && <p className="submission-notice" role="status">{shareNotice}</p>}
        {resultError && <p className="submission-error" role="alert">{resultError}</p>}
        {resultNotice && <p className="submission-notice" role="status">{resultNotice}</p>}
      </>
    )}
    {progressError && <p className="submission-error" role="alert">{progressError}</p>}
    {nextLevelId !== null && (
      <ScreenButton onClick={() => onNextLevel(nextLevelId)}>NEXT LEVEL {String(nextLevelId).padStart(2, '0')}</ScreenButton>
    )}
    <ScreenButton onClick={() => goTo('play')}>PLAY AGAIN</ScreenButton>
    <ScreenButton variant="secondary" onClick={() => goTo('levels')}>LEVEL SELECT</ScreenButton>
    <ScreenButton variant="secondary" onClick={() => goTo('menu')}>MAIN MENU</ScreenButton>
  </StateScreen>
  );
};

type StateScreenProps = {
  name: Exclude<Screen, 'play'>;
  eyebrow: string;
  title: string;
  children: ReactNode;
};

const StateScreen = ({ name, eyebrow, title, children }: StateScreenProps) => (
  <main className="state-screen-shell">
    <section className={`state-screen-card ${name}-screen-card`} aria-labelledby={`${name}-screen-title`}>
      <span className="sector-tag">{eyebrow}</span>
      <h1 id={`${name}-screen-title`}>{title}</h1>
      {children}
    </section>
  </main>
);

type ScreenButtonProps = {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
};

const ScreenButton = ({
  children,
  onClick,
  variant = 'primary',
}: ScreenButtonProps) => (
  <button
    type="button"
    className={`state-screen-button ${variant === 'secondary' ? 'secondary' : ''}`}
    onClick={onClick}
  >
    {children}
  </button>
);

const createGrid = (level: DailyLevel): CellState[] =>
  Array.from({ length: level.size * level.size }, (_, index) => {
    if (index === level.source) return { type: 4, rotation: 0, fixed: 'source' };
    const target = level.targets.find((candidate) => candidate.index === index);
    if (target) {
      return {
        type: 4,
        rotation: 0,
        fixed: 'target',
        requiredVoltage: target.voltage,
      };
    }
    if (level.boosters.includes(index)) {
      return { type: 4, rotation: 0, fixed: 'booster' };
    }
    if (level.walls.includes(index)) return { type: 0, rotation: 0, fixed: 'wall' };
    if (level.hazards.includes(index)) return { type: 4, rotation: 0, fixed: 'hazard' };
    return { type: 0, rotation: 0, fixed: 'none' };
  });

const toPuzzle = (level: DailyLevel): Puzzle => ({
  size: level.size,
  source: level.source,
  targets: level.targets,
  boosters: level.boosters,
  walls: level.walls,
  hazards: level.hazards,
});

const toPlacements = (grid: readonly CellState[]): Placement[] =>
  grid.map(({ type, rotation, fixed }) => ({ type, rotation, fixed }));

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
};

const getCurrentTimestamp = (): number => Date.now();

const gradeFor = (cost: number, targetCost: number): Grade => {
  if (cost <= targetCost) return 'S';
  if (cost <= targetCost * 1.15) return 'A';
  if (cost <= targetCost * 1.3) return 'B';
  return 'C';
};

type PlayScreenProps = {
  initialLevelId: number;
  goTo: GoToScreen;
  onWin: (
    levelId: number,
    hintsUsed: number,
    finalCost: number,
    targetCost: number,
    partsUsed: number,
    durationSeconds: number,
    isDaily: boolean
  ) => Promise<void>;
};

export const PlayScreen = ({
  initialLevelId,
  goTo,
  onWin,
}: PlayScreenProps) => {
  const currentLevel = getLevelById(initialLevelId);
  if (!currentLevel) {
    throw new Error(`Unknown circuit sector: ${initialLevelId}`);
  }
  const [grid, setGrid] = useState<CellState[]>(() => createGrid(currentLevel));
  const [selectedTool, setSelectedTool] = useState<number>(1);
  const [history, setHistory] = useState<CellState[][]>([]);
  const [movesUsed, setMovesUsed] = useState<number>(0);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [hintSuggestion, setHintSuggestion] = useState<HintSuggestion | null>(null);
  const [hintFailure, setHintFailure] = useState<HintFailure | null>(null);
  const [isSolvingHint, setIsSolvingHint] = useState<boolean>(false);
  const hintRequestRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const timerDisplayRef = useRef<HTMLSpanElement>(null);
  const sparkCanvasRef = useRef<HTMLCanvasElement>(null);
  const sparkParticlesRef = useRef<SparkParticle[]>([]);
  const sparkFrameRef = useRef<number | null>(null);
  const sparkDrawRef = useRef<(() => void) | null>(null);
  const reducedMotionRef = useRef<boolean>(false);
  const tileElementsRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [dismissedModal, setDismissedModal] = useState<boolean>(false);
  const [openPanel, setOpenPanel] = useState<'stats' | null>(null);
  const [muted, setMutedState] = useState<boolean>(() => !getSoundEnabled());
  const [winTime, setWinTime] = useState<number | null>(null);
  const [winSequence, setWinSequence] = useState<boolean>(false);
  const [winDistances, setWinDistances] = useState<ReadonlyMap<number, number>>(
    () => new Map()
  );
  const winTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winSequenceStartedRef = useRef<boolean>(false);
  const dailyState = useSyncExternalStore(
    subscribeDailyState,
    () => getDailyState(1),
    () => getDailyState(1)
  );
  const getElapsedSeconds = (): number =>
    Math.max(0, Math.floor((getCurrentTimestamp() - startedAtRef.current) / 1000));

  const evaluation = useMemo(
    () => evaluate(toPuzzle(currentLevel), grid, hintsUsed * HINT_COST),
    [currentLevel, grid, hintsUsed]
  );
  const {
    voltages,
    hazardPowered,
    receivers,
    connections: tileConnections,
    hardwareCost,
  } = evaluation;
  const targetsSatisfied = hazardPowered
    ? 0
    : receivers.filter((receiver) => receiver.met).length;
  const solved =
    receivers.every((receiver) => receiver.met) && !hazardPowered;

  const partsUsed = useMemo(() => {
    let parts = 0;
    grid.forEach((cell) => {
      if (cell.fixed === 'none' && cell.type > 0) {
        parts += 1;
      }
    });
    return parts;
  }, [grid]);

  const playerStats = dailyState.status === 'ready' ? dailyState.data.playerStats : null;
  const gradeStats =
    dailyState.status === 'ready'
      ? [
          { grade: 'S', count: dailyState.data.gradeDistribution.sPlus, style: 's-grade' },
          { grade: 'A', count: dailyState.data.gradeDistribution.a, style: 'a-grade' },
          { grade: 'B', count: dailyState.data.gradeDistribution.b, style: 'b-grade' },
          { grade: 'C', count: dailyState.data.gradeDistribution.c, style: 'c-grade' },
        ]
      : [];
  const peakGradeCount = Math.max(1, ...gradeStats.map((item) => item.count));
  const finalCost = evaluation.totalCost;
  const grade = gradeFor(finalCost, currentLevel.targetCost);
  const maxWinDistance = Math.max(0, ...winDistances.values());
  const winDelayPerHop = maxWinDistance > 0
    ? Math.min(75, 600 / maxWinDistance)
    : 0;
  const previewVoltages = useMemo(() => {
    const previews = new Map<number, number>();
    for (let index = 0; index < grid.length; index += 1) {
      const current = grid[index];
      if (!current || current.fixed !== 'none' || current.type !== 0) continue;

      let bestVoltage = 0;
      for (let rotation = 0; rotation < 4; rotation += 1) {
        const candidate = [...grid];
        candidate[index] = {
          type: selectedTool,
          rotation,
          fixed: 'none',
        };
        bestVoltage = Math.max(
          bestVoltage,
          evaluate(toPuzzle(currentLevel), candidate).voltages.get(index) ?? 0
        );
      }
      if (bestVoltage > 0) previews.set(index, bestVoltage);
    }
    return previews;
  }, [currentLevel, grid, selectedTool]);
  useEffect(() => {
    if (startedAtRef.current === 0) {
      startedAtRef.current = getCurrentTimestamp();
    }
    if (winTime !== null) return undefined;

    let animationFrame = 0;
    let lastDisplayedSeconds = -1;
    const updateTimer = (): void => {
      const elapsedSeconds = getElapsedSeconds();
      if (
        elapsedSeconds !== lastDisplayedSeconds &&
        timerDisplayRef.current
      ) {
        timerDisplayRef.current.textContent = `◷ ${formatTime(elapsedSeconds)}`;
        lastDisplayedSeconds = elapsedSeconds;
      }
      animationFrame = window.requestAnimationFrame(updateTimer);
    };

    animationFrame = window.requestAnimationFrame(updateTimer);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [winTime]);

  useEffect(() => {
    const canvas = sparkCanvasRef.current;
    const tileElements = tileElementsRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;

    const resizeCanvas = (): void => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * pixelRatio);
      canvas.height = Math.round(window.innerHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = (): void => {
      reducedMotionRef.current = motionPreference.matches;
      if (motionPreference.matches) {
        sparkParticlesRef.current = [];
        if (sparkFrameRef.current !== null) {
          window.cancelAnimationFrame(sparkFrameRef.current);
          sparkFrameRef.current = null;
        }
        context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    let previousFrameTime: number | null = null;
    const drawFrame = (timestamp: number): void => {
      sparkFrameRef.current = null;
      const elapsed = previousFrameTime === null
        ? 0
        : Math.min((timestamp - previousFrameTime) / 1000, 0.05);
      previousFrameTime = timestamp;

      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const particles = sparkParticlesRef.current;
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        if (!particle) continue;

        particle.age += elapsed;
        if (particle.age >= particle.lifetime) {
          particles.splice(index, 1);
          continue;
        }

        particle.velocityY += 90 * elapsed;
        particle.x += particle.velocityX * elapsed;
        particle.y += particle.velocityY * elapsed;
        const opacity = 1 - particle.age / particle.lifetime;
        context.globalAlpha = opacity;
        context.fillStyle = `hsl(${particle.hue} 100% 68%)`;
        context.shadowBlur = 10;
        context.shadowColor = `hsl(${particle.hue} 100% 68%)`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * opacity, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;

      if (particles.length > 0 && !reducedMotionRef.current) {
        sparkFrameRef.current = window.requestAnimationFrame(drawFrame);
      } else {
        previousFrameTime = null;
      }
    };

    sparkDrawRef.current = () => {
      if (
        sparkFrameRef.current === null &&
        sparkParticlesRef.current.length > 0 &&
        !reducedMotionRef.current
      ) {
        previousFrameTime = null;
        sparkFrameRef.current = window.requestAnimationFrame(drawFrame);
      }
    };

    resizeCanvas();
    updateMotionPreference();
    window.addEventListener('resize', resizeCanvas);
    motionPreference.addEventListener('change', updateMotionPreference);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      motionPreference.removeEventListener('change', updateMotionPreference);
      if (sparkFrameRef.current !== null) {
        window.cancelAnimationFrame(sparkFrameRef.current);
      }
      if (winTimeoutRef.current !== null) {
        window.clearTimeout(winTimeoutRef.current);
      }
      sparkFrameRef.current = null;
      sparkDrawRef.current = null;
      sparkParticlesRef.current = [];
      tileElements.clear();
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
  }, []);

  const spawnSparks = (tile: HTMLButtonElement, isSurge = false): void => {
    if (reducedMotionRef.current) return;
    const canvas = sparkCanvasRef.current;
    if (!canvas) return;

    const bounds = tile.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const particles = sparkParticlesRef.current;
    const burst = createSparkBurst(centerX, centerY, isSurge);
    const overflow = particles.length + burst.length - MAX_SPARK_PARTICLES;
    if (overflow > 0) {
      particles.splice(0, overflow);
    }
    particles.push(...burst);
    sparkDrawRef.current?.();
  };

  const pulseDistancesFromCore = (
    winEvaluation: ReturnType<typeof evaluate>
  ): Map<number, number> => {
    const distances = new Map<number, number>([[currentLevel.source, 0]]);
    const queue = [currentLevel.source];

    while (queue.length > 0) {
      const index = queue.shift();
      if (index === undefined) continue;
      const distance = distances.get(index);
      if (distance === undefined) continue;
      const row = Math.floor(index / currentLevel.size);
      const column = index % currentLevel.size;
      const arms = winEvaluation.connections.get(index) ?? [];

      for (const direction of DIRECTIONS) {
        if (!arms.includes(direction.direction)) continue;
        const nextRow = row + direction.row;
        const nextColumn = column + direction.column;
        if (
          nextRow < 0 ||
          nextRow >= currentLevel.size ||
          nextColumn < 0 ||
          nextColumn >= currentLevel.size
        ) {
          continue;
        }

        const nextIndex = nextRow * currentLevel.size + nextColumn;
        if (
          distances.has(nextIndex) ||
          !winEvaluation.voltages.has(nextIndex) ||
          !(winEvaluation.connections.get(nextIndex) ?? []).includes(direction.opposite)
        ) {
          continue;
        }
        distances.set(nextIndex, distance + 1);
        queue.push(nextIndex);
      }
    }

    return distances;
  };

  const spawnWinCelebration = (
    winEvaluation: ReturnType<typeof evaluate>
  ): void => {
    if (reducedMotionRef.current) return;
    const particles = sparkParticlesRef.current;
    particles.length = 0;
    for (const index of winEvaluation.voltages.keys()) {
      const tile = tileElementsRef.current.get(index);
      if (!tile || particles.length >= MAX_SPARK_PARTICLES) continue;
      const bounds = tile.getBoundingClientRect();
      const burst = createSparkBurst(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
        false
      ).slice(0, Math.min(3, MAX_SPARK_PARTICLES - particles.length));
      particles.push(...burst);
    }
    sparkDrawRef.current?.();
  };

  const startWinSequence = (
    winEvaluation: ReturnType<typeof evaluate>,
    hints: number
  ): void => {
    if (winSequenceStartedRef.current) return;
    winSequenceStartedRef.current = true;
    const completedTime = getElapsedSeconds();
    setWinTime(completedTime);
    if (timerDisplayRef.current) {
      timerDisplayRef.current.textContent = `◷ ${formatTime(completedTime)}`;
    }

    const distances = pulseDistancesFromCore(winEvaluation);
    setWinDistances(distances);
    setWinSequence(true);
    if (reducedMotionRef.current) {
      playWin();
      void onWin(
        currentLevel.id,
        hints,
        winEvaluation.totalCost,
        currentLevel.targetCost,
        partsUsed,
        completedTime,
        currentLevel.mode === 'daily'
      );
      return;
    }

    const maxDistance = Math.max(0, ...distances.values());
    const delayPerHop = maxDistance > 0
      ? Math.min(75, 600 / maxDistance)
      : 0;
    const pulseDuration = maxDistance * delayPerHop + 380;

    winTimeoutRef.current = window.setTimeout(() => {
      spawnWinCelebration(winEvaluation);
      playWin();
      winTimeoutRef.current = window.setTimeout(() => {
        void onWin(
          currentLevel.id,
          hints,
          winEvaluation.totalCost,
          currentLevel.targetCost,
          partsUsed,
          completedTime,
          currentLevel.mode === 'daily'
        );
      }, 450);
    }, pulseDuration);

  };

  const popTile = (tile: HTMLButtonElement): void => {
    if (reducedMotionRef.current) return;
    tile.classList.remove('tile-pop');
    void tile.offsetWidth;
    tile.classList.add('tile-pop');
    const finishPop = (event: AnimationEvent): void => {
      if (event.target !== tile) return;
      tile.classList.remove('tile-pop');
      tile.removeEventListener('animationend', finishPop);
    };
    tile.addEventListener('animationend', finishPop);
  };

  const handleTileClick = (index: number, tile: HTMLButtonElement): void => {
    if (winSequenceStartedRef.current) return;
    const cell = grid[index];
    if (!cell || cell.fixed !== 'none') return;

    if (hintFailure?.index === index && cell.type > 0) {
      const nextGrid = [...grid];
      nextGrid[index] = { type: 0, rotation: 0, fixed: 'none' };
      setHistory((previous) => [...previous.slice(-19), grid]);
      setGrid(nextGrid);
      setMovesUsed((previous) => previous + 1);
      setHintFailure(null);
      setHintSuggestion(null);
      const nextPropagation = evaluate(
        toPuzzle(currentLevel),
        nextGrid,
        hintsUsed * HINT_COST
      );
      if (
        !nextPropagation.hazardPowered &&
        nextPropagation.receivers.every((receiver) => receiver.met) &&
        !solved
      ) {
        startWinSequence(nextPropagation, hintsUsed);
      } else {
        playRotate();
      }
      return;
    }

    const nextGrid = [...grid];
    const suggestedPlacement = hintSuggestion?.index === index
      ? hintSuggestion
      : null;
    const isRotation = !suggestedPlacement && cell.type === selectedTool;
    const countsAsMove = cell.type === 0 || cell.type !== selectedTool || cell.rotation < 3;
    if (suggestedPlacement) {
      nextGrid[index] = {
        type: suggestedPlacement.type,
        rotation: suggestedPlacement.rotation,
        fixed: 'none',
      };
    } else if (cell.type === 0) {
      nextGrid[index] = { type: selectedTool, rotation: 0, fixed: 'none' };
    } else if (isRotation && cell.rotation < 3) {
      nextGrid[index] = { type: cell.type, rotation: cell.rotation + 1, fixed: 'none' };
    } else if (isRotation) {
      nextGrid[index] = { type: 0, rotation: 0, fixed: 'none' };
    } else {
      nextGrid[index] = { type: selectedTool, rotation: 0, fixed: 'none' };
    }

    setHistory((previous) => [...previous.slice(-19), grid]);
    setGrid(nextGrid);
    if (countsAsMove) setMovesUsed((previous) => previous + 1);
    setDismissedModal(false);
    setHintSuggestion(null);
    setHintFailure(null);
    if (nextGrid[index]?.type !== 0) popTile(tile);
    const nextPropagation = evaluate(
      toPuzzle(currentLevel),
      nextGrid,
      hintsUsed * HINT_COST
    );
    if (nextPropagation.voltages.has(index) && nextGrid[index]?.type !== 0) {
      spawnSparks(tile);
    }
    if (suggestedPlacement || isRotation) {
      playRotate();
    } else {
      playPlace();
    }
    if (nextPropagation.hazardPowered) {
      if (!hazardPowered) playHazard();
      return;
    }

    const receiverJustMet = nextPropagation.receivers.some((nextReceiver) =>
      nextReceiver.met &&
      !receivers.find((previousReceiver) =>
        previousReceiver.index === nextReceiver.index
      )?.met
    );
    if (receiverJustMet) playReceiverMet();

    const nextSolved = nextPropagation.receivers.every((receiver) => receiver.met);
    const currentSolved = solved;
    if (nextSolved && !currentSolved) {
      startWinSequence(nextPropagation, hintsUsed);
    }
  };

  const restartLevel = (): void => {
    hintRequestRef.current += 1;
    setIsSolvingHint(false);
    setHintSuggestion(null);
    setHintFailure(null);
    setGrid(createGrid(currentLevel));
    setHistory([]);
    setMovesUsed(0);
    setHintsUsed(0);
    startedAtRef.current = getCurrentTimestamp();
    setWinTime(null);
    setWinSequence(false);
    setWinDistances(new Map());
    winSequenceStartedRef.current = false;
    setDismissedModal(false);
  };

  const undo = (): void => {
    const previous = history.at(-1);
    if (!previous) return;
    setGrid(previous);
    setHistory((items) => items.slice(0, -1));
    setDismissedModal(false);
    setHintSuggestion(null);
    setHintFailure(null);
    playRotate();
  };

  const requestHint = async (): Promise<void> => {
    if (isSolvingHint || solved || hintSuggestion) return;
    playHint();

    const requestId = hintRequestRef.current + 1;
    hintRequestRef.current = requestId;
    setIsSolvingHint(true);
    setHintSuggestion(null);
    setHintFailure(null);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 20);
    });
    if (hintRequestRef.current !== requestId) return;

    try {
      const puzzle = toPuzzle(currentLevel);
      const currentPlacements = toPlacements(grid);
      const deadline = Date.now() + 2000;
      const solution = solve(puzzle, currentPlacements, { timeLimitMs: 1200 });
      if (hintRequestRef.current !== requestId) return;

      if (solution) {
        const solutionEvaluation = evaluate(puzzle, solution);
        const suggestionIndex = solution.findIndex((placement, index) => {
          const current = currentPlacements[index];
          return current?.fixed === 'none' &&
            current.type === 0 &&
            placement.fixed === 'none' &&
            placement.type > 0;
        });
        const suggestion = solution[suggestionIndex];
        if (
          !solutionEvaluation.hazardPowered &&
          solutionEvaluation.receivers.every((receiver) => receiver.met) &&
          suggestionIndex >= 0 &&
          suggestion
        ) {
          const nextHintsUsed = hintsUsed + 1;
          setHintsUsed(nextHintsUsed);
          setHintSuggestion({
            index: suggestionIndex,
            type: suggestion.type,
            rotation: suggestion.rotation,
            connections: solutionEvaluation.connections.get(suggestionIndex) ?? [],
          });
          setDismissedModal(false);
          return;
        }
      }

      const enteredTiles = currentPlacements
        .map((placement, index) => ({ placement, index }))
        .filter(({ placement }) => placement.fixed === 'none' && placement.type > 0);
      let wrongTileIndex: number | null = null;
      let wrongReason = 'This trace blocks a complete route; tap it to undo it.';

      if (evaluation.hazardPowered) {
        for (const hazardIndex of currentLevel.hazards) {
          const hazardRow = Math.floor(hazardIndex / currentLevel.size);
          const hazardColumn = hazardIndex % currentLevel.size;
          for (const direction of DIRECTIONS) {
            const row = hazardRow + direction.row;
            const column = hazardColumn + direction.column;
            if (row < 0 || row >= currentLevel.size || column < 0 || column >= currentLevel.size) {
              continue;
            }
            const candidateIndex = row * currentLevel.size + column;
            const candidate = currentPlacements[candidateIndex];
            const arms = evaluation.connections.get(candidateIndex) ?? [];
            if (
              candidate?.fixed === 'none' &&
              candidate.type > 0 &&
              evaluation.voltages.has(candidateIndex) &&
              arms.includes((direction.direction + 2) % 4)
            ) {
              wrongTileIndex = candidateIndex;
              wrongReason = 'This trace powers a hazard; tap it to break the overload.';
              break;
            }
          }
          if (wrongTileIndex !== null) break;
        }
      }

      if (wrongTileIndex === null) {
        for (const { index } of enteredTiles) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) break;

          const withoutTile = [...currentPlacements];
          withoutTile[index] = { type: 0, rotation: 0, fixed: 'none' };
          const completion = solve(puzzle, withoutTile, {
            timeLimitMs: Math.min(200, remainingMs),
            lockedEmptyIndices: [index],
          });
          if (
            completion &&
            !evaluate(puzzle, completion).hazardPowered &&
            evaluate(puzzle, completion).receivers.every((receiver) => receiver.met)
          ) {
            wrongTileIndex = index;
            wrongReason = 'This trace blocks every complete route; tap it to undo it.';
            break;
          }
        }
      }

      if (wrongTileIndex === null && enteredTiles.length > 0) {
        const unpoweredTile = enteredTiles.find(
          ({ index }) => !evaluation.voltages.has(index)
        );
        wrongTileIndex = unpoweredTile?.index ?? enteredTiles.at(-1)?.index ?? null;
        wrongReason = evaluation.hazardPowered
          ? 'This trace feeds a hazard; tap it to clear the overload.'
          : 'This trace is misplaced; tap it to undo it.';
      }

      if (wrongTileIndex !== null || enteredTiles.length === 0) {
        setHintsUsed((previous) => previous + 1);
        setHintFailure({ index: wrongTileIndex, message: wrongReason });
        setDismissedModal(false);
      }
    } catch (error) {
      console.error('Unable to solve the current circuit for a hint:', error);
      setHintFailure({
        index: null,
        message: 'Hint search failed; try again or undo a trace.',
      });
    } finally {
      if (hintRequestRef.current === requestId) {
        setIsSolvingHint(false);
      }
    }
  };

  const toggleSound = (): void => {
    const nextMuted = !muted;
    setMutedState(nextMuted);
    setSoundEnabled(!nextMuted);
    if (!nextMuted) playPlace();
  };

  return (
    <main className="cyber-shell game-shell">
      <canvas
        ref={sparkCanvasRef}
        className="spark-overlay"
        aria-hidden="true"
      />
      <header className="hud-header">
        <div className="hud-top">
          <div className="game-brand">
            <span className="sector-tag">
              {currentLevel.mode === 'daily'
                ? `DAILY CIRCUIT / ${currentLevel.date}`
                : `CAMPAIGN / SECTOR ${String(currentLevel.id).padStart(2, '0')}`}
            </span>
            <h1 className="hud-title">{currentLevel.title}</h1>
          </div>
          <div className="game-header-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => goTo('levels')}
              disabled={winSequence}
            >
              SECTORS
            </button>
            <button
              type="button"
              className={`sound-toggle ${!muted ? 'is-on' : ''}`}
              onClick={toggleSound}
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              aria-pressed={!muted}
            >
              {muted ? '♫̸' : '♪'}
            </button>
          </div>
        </div>

        <div className="hud-metrics">
          <div className="metric-box">
            <span className="metric-label">LIVE COST</span>
            <span className={`metric-val spent-target ${grade === 'S' ? 'optimal' : grade === 'C' ? 'danger' : 'warn'}`}>
              SPENT ${finalCost} / TARGET ${currentLevel.targetCost}
            </span>
          </div>
          <div className="metric-box">
            <span className="metric-label">NODES ONLINE</span>
            <span className="metric-val">{targetsSatisfied} / {currentLevel.targets.length}</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">MOVES</span>
            <span className="metric-val">{movesUsed}</span>
          </div>
          <div className="metric-box">
            <span className="metric-label">SPEEDRUN CLOCK</span>
            <span
              ref={timerDisplayRef}
              className={`metric-val ${solved ? 'optimal' : ''}`}
            >
              ◷ {formatTime(winTime ?? 0)}
            </span>
          </div>
        </div>
      </header>

      <div
        className={`pcb-board ${hazardPowered ? 'board-overload' : ''} ${winSequence ? 'win-sequence' : ''}`}
        style={{ gridTemplateColumns: `repeat(${currentLevel.size}, minmax(0, 1fr))` }}
        role="grid"
        aria-label={`${currentLevel.title} circuit grid`}
      >
        {grid.map((cell, index) => {
          const voltage = voltages.get(index) ?? 0;
          const isPowered = voltage > 0;
          const cellLinks = tileConnections.get(index) ?? [];
          const receiver = receivers.find((result) => result.index === index);
          const targetMet = cell.fixed === 'target' && (receiver?.met ?? false);
          const receiverFill = receiver
            ? Math.min(100, Math.max(0, receiver.voltage / receiver.requiredVoltage * 100))
            : 0;
          const coordinate = `${String.fromCharCode(65 + Math.floor(index / currentLevel.size))}${(index % currentLevel.size) + 1}`;
          const previewVoltage = previewVoltages.get(index);
          return (
            <button
              type="button"
              role="gridcell"
              key={index}
              ref={(element) => {
                if (element) {
                  tileElementsRef.current.set(index, element);
                } else {
                  tileElementsRef.current.delete(index);
                }
              }}
              className={`pcb-tile ${cell.fixed} ${isPowered ? `powered voltage-${Math.min(5, Math.max(1, voltage))}` : ''} ${cell.fixed === 'hazard' && isPowered ? 'hazard-powered' : ''} ${targetMet ? 'target-met' : ''} ${hintSuggestion?.index === index ? 'hint-ghost-tile' : ''} ${hintFailure?.index === index ? 'hint-wrong-tile' : ''}`}
              aria-label={`${coordinate}, ${cell.fixed === 'none' ? `${cell.type > 0 ? 'component' : 'empty'}, ${voltage} volts${previewVoltage === undefined ? '' : `, ghost preview ${previewVoltage} volts`}${hintSuggestion?.index === index ? `, hint type ${hintSuggestion.type}, rotation ${hintSuggestion.rotation}` : ''}${hintFailure?.index === index ? ', suggested tile to undo' : ''}` : cell.fixed}`}
              aria-disabled={cell.fixed !== 'none'}
              onClick={(event) => handleTileClick(index, event.currentTarget)}
            >
              <span className="coord-mark">{coordinate}</span>
              {cell.fixed === 'none' && cell.type > 0 && (
                <svg className="trace-svg" viewBox="0 0 44 44" aria-hidden="true">
                  {DIRECTIONS.map((direction) => (
                    cellLinks.includes(direction.direction) && (
                      <line
                        key={direction.direction}
                        x1="22"
                        y1="22"
                        x2={22 + direction.column * 22}
                        y2={22 + direction.row * 22}
                        className={isPowered ? `trace-pulse voltage-${Math.min(5, Math.max(1, voltage))}` : 'trace-base'}
                        style={{
                          animationDelay: winSequence
                            ? `${(winDistances.get(index) ?? 0) * winDelayPerHop}ms`
                            : undefined,
                        }}
                      />
                    )
                  ))}
                  <circle cx="22" cy="22" r="5" className="trace-joint" />
                </svg>
              )}
              {cell.fixed === 'source' && <div className="hw-node source-core"><span>⚡</span><small>CORE</small></div>}
              {cell.fixed === 'booster' && <div className={`hw-node booster-core ${isPowered ? 'active' : ''}`}><span>◈</span><small>RESET +{BOOSTER_VOLTAGE}V</small></div>}
              {cell.fixed === 'target' && (
                <div className={`hw-node target-core ${targetMet ? 'online' : ''}`}>
                  <span
                    className="receiver-ring"
                    style={{
                      background: `conic-gradient(var(--cyan) ${receiverFill}%, rgb(69 242 208 / 12%) ${receiverFill}% 100%)`,
                    }}
                    aria-hidden="true"
                  >
                    <span className="receiver-icon">◎</span>
                  </span>
                  <small>NEED {receiver?.requiredVoltage ?? cell.requiredVoltage ?? 1}V</small>
                </div>
              )}
              {cell.fixed === 'hazard' && <div className="hw-node hazard-core"><span>☢</span><small>TRAP</small></div>}
              {cell.fixed === 'none' && cell.type > 0 && isPowered && <span className="v-badge">{voltage}V</span>}
              {cell.fixed !== 'none' && isPowered && <span className="v-badge">{voltage}V</span>}
              {cell.fixed === 'none' && cell.type === 0 && previewVoltage !== undefined && (
                <span className="v-badge ghost-voltage">~{previewVoltage}V</span>
              )}
              {hintSuggestion?.index === index && (
                <span
                  className="hint-ghost"
                  aria-hidden="true"
                >
                  <svg className="hint-ghost-svg" viewBox="0 0 44 44">
                    {hintSuggestion.connections.map((directionIndex) => {
                      const direction = DIRECTIONS.find(
                        (candidate) => candidate.direction === directionIndex
                      );
                      if (!direction) return null;
                      return (
                        <line
                          key={direction.direction}
                          x1="22"
                          y1="22"
                          x2={22 + direction.column * 22}
                          y2={22 + direction.row * 22}
                        />
                      );
                    })}
                    <circle cx="22" cy="22" r="5" />
                  </svg>
                  <small>T{hintSuggestion.type} · R{hintSuggestion.rotation}</small>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="target-guidance">Target = cheapest known solution. Spend less for a higher rank.</p>

      <div className="game-bottom-toolbar">
        <section className="component-deck" aria-label="Circuit components">
          <button type="button" className={`deck-card ${selectedTool === 1 ? 'selected' : ''}`} onClick={() => setSelectedTool(1)} aria-pressed={selectedTool === 1}><span className="card-icon">┃</span><span className="card-name">Conduit</span><span className="card-cost">$10</span></button>
          <button type="button" className={`deck-card ${selectedTool === 2 ? 'selected' : ''}`} onClick={() => setSelectedTool(2)} aria-pressed={selectedTool === 2}><span className="card-icon">┗</span><span className="card-name">Vector</span><span className="card-cost">$15</span></button>
          <button type="button" className={`deck-card ${selectedTool === 3 ? 'selected' : ''}`} onClick={() => setSelectedTool(3)} aria-pressed={selectedTool === 3}><span className="card-icon">┣</span><span className="card-name">Splitter</span><span className="card-cost">$25</span></button>
          <button type="button" className="deck-card action-card" onClick={undo} disabled={history.length === 0}><span className="card-icon">↶</span><span className="card-name">Undo</span><span className="card-cost">{history.length}</span></button>
          <button type="button" className="deck-card action-card danger" onClick={restartLevel}><span className="card-icon">↺</span><span className="card-name">Restart</span><span className="card-cost">RST</span></button>
        </section>

        <nav className="game-utility-row" aria-label="Game tools">
          <span className="legend-strip"><span>⚡ Core {SOURCE_VOLTAGE}V</span><span>· −1V / tile</span><span>◈ Booster +{BOOSTER_VOLTAGE}V</span><span>☢ Overload</span></span>
          <button
            type="button"
            onClick={() => void requestHint()}
            disabled={isSolvingHint || solved || hintSuggestion !== null}
            aria-label={isSolvingHint ? 'Solving the current circuit for a hint' : `Solve circuit hint, costs $${HINT_COST}`}
            aria-busy={isSolvingHint}
          >
            {isSolvingHint ? 'SOLVING…' : `HINT +$${HINT_COST} (${hintsUsed})`}
          </button>
          <button type="button" onClick={() => goTo('tutorial')}>TRAINING</button>
          <button type="button" onClick={() => setOpenPanel('stats')}>STATS</button>
          <button type="button" onClick={() => goTo('menu')} className="back-inline-btn">MENU</button>
        </nav>
        {(hintFailure || hintSuggestion) && (
          <p className={`hint-feedback ${hintFailure ? 'hint-warning' : ''}`} role="status">
            {hintFailure?.message ?? 'Ghost trace ready: tap the pulsing tile to place it.'}
          </p>
        )}
      </div>

      {solved && !dismissedModal && (
        <div className="telemetry-overlay" onClick={() => setDismissedModal(true)}>
          <section
            className="telemetry-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="completion-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div><span className="sector-tag">SIGNAL ROUTED // RUN COMPLETE</span><h2 id="completion-title">{currentLevel.title}</h2></div>
              <div className="grade-stamp">{grade}</div>
            </header>
            <div className="telemetry-grid">
              <div className="t-stat"><span>FINAL SPENT</span><strong>${finalCost}</strong><small>TARGET ${currentLevel.targetCost} · {partsUsed} parts</small></div>
              <div className="t-stat"><span>RUN TIME</span><strong>{formatTime(winTime ?? 0)}</strong><small>Personal best {playerStats?.personalBest === null || playerStats?.personalBest === undefined ? '—' : `$${playerStats.personalBest}`}</small></div>
              <div className="t-stat"><span>COMMUNITY AVG</span><strong>{dailyState.status === 'ready' && dailyState.data.globalAverageCost !== null ? `$${dailyState.data.globalAverageCost.toFixed(0)}` : '—'}</strong><small>{dailyState.status === 'ready' ? `${dailyState.data.totalCompletions} daily clears` : 'Live telemetry'}</small></div>
              <div className="t-stat"><span>ACTIVE STREAK</span><strong>{playerStats ? `${playerStats.streak} ${playerStats.streak === 1 ? 'day' : 'days'}` : '—'}</strong><small>{grade === 'C' || grade === 'B' ? 'S or A unlocks flair' : `${grade} Architect flair eligible`}</small></div>
            </div>

            <div className="hardware-breakdown">
              <span className="hist-title">BUILD BREAKDOWN</span>
              <span><b>{partsUsed}</b> trace tiles <i>${hardwareCost} hardware</i></span>
              <span><b>{hintsUsed}</b> hints <i>+${hintsUsed * HINT_COST} cost</i></span>
              <span><b>{movesUsed}</b> moves</span>
              <span><b>{targetsSatisfied}</b> / {currentLevel.targets.length} receivers online</span>
              <span><b>{formatTime(winTime ?? 0)}</b> elapsed</span>
            </div>

            <div className="histogram-box">
              <span className="hist-title">LIVE COMMUNITY EFFICIENCY</span>
              {dailyState.status === 'ready' ? (
                <div className="hist-bars" role="img" aria-label={`Community grades: ${dailyState.data.gradeDistribution.sPlus} S, ${dailyState.data.gradeDistribution.a} A, ${dailyState.data.gradeDistribution.b} B, ${dailyState.data.gradeDistribution.c} C`}>
                  {gradeStats.map((item) => (
                    <div className="hist-column" key={item.grade}>
                      <div className={`h-bar ${item.style} ${item.grade === grade ? 'you' : ''}`} style={{ height: `${Math.max(8, item.count / peakGradeCount * 100)}%` }}><span>{item.count}</span></div>
                      <small>{item.grade}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="histogram-status" role="status">{dailyState.status === 'error' ? 'Community telemetry unavailable.' : 'Syncing community results…'}</p>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setDismissedModal(true)}>BACK TO CIRCUIT</button>
            </div>
          </section>
        </div>
      )}

      {openPanel && (
        <div className="telemetry-overlay" onClick={() => setOpenPanel(null)}>
          <section className="telemetry-modal title-info-modal" role="dialog" aria-modal="true" aria-labelledby="game-info-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="sector-tag">DAILY CIRCUIT // PILOT DATA</span><h2 id="game-info-title">Pilot statistics</h2></div><button type="button" className="close-modal-btn" onClick={() => setOpenPanel(null)} aria-label="Close dialog">×</button></div>
            <div className="title-stats-preview">
                <div className="tp-box"><span>PUZZLES SOLVED</span><strong>{playerStats?.totalPuzzles ?? '—'}</strong></div>
                {playerStats?.personalBests.map((best) => (
                  <div className="tp-box" key={best.levelId}>
                    <span>D{best.levelId} PERSONAL BEST</span>
                    <strong>{best.cost === null ? '—' : `$${best.cost}`}</strong>
                  </div>
                ))}
                <div className="tp-box"><span>AVG HARDWARE COST</span><strong>{playerStats?.averageCost === null || playerStats?.averageCost === undefined ? '—' : `$${playerStats.averageCost.toFixed(0)}`}</strong></div>
                <div className="tp-box"><span>EFFICIENCY</span><strong>{playerStats?.efficiencyRating ?? 'Awaiting first run'}</strong></div>
                <div className="tp-box"><span>BEST RUN</span><strong>{playerStats?.bestTimeSeconds === null || playerStats?.bestTimeSeconds === undefined ? '—' : formatTime(playerStats.bestTimeSeconds)}</strong></div>
                <div className="tp-box"><span>ACTIVE STREAK</span><strong>{playerStats ? `${playerStats.streak} days` : '—'}</strong></div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export const App = () => {
  const [screen, setScreen] = useState<Screen>('boot');
  const [selectedLevel, setSelectedLevel] = useState<number>(DAILY_LEVEL_ID);
  const [completedRun, setCompletedRun] = useState<CompletedRun>({
    hintsUsed: 0,
    finalCost: 0,
    targetCost: 0,
    nextLevelId: null,
    progressError: null,
    isDaily: false,
    dailyStreak: null,
    distribution: null,
    dailyResultSaved: false,
    resultError: null,
    resultNotice: null,
  });
  const bootTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dailyState = useSyncExternalStore(
    subscribeDailyState,
    () => getDailyState(1),
    () => getDailyState(1)
  );
  const streak =
    dailyState.status === 'ready'
      ? dailyState.data.playerStats.streak
      : undefined;
  const campaignProgress = useSyncExternalStore(
    subscribeCampaignProgress,
    getCampaignProgress,
    getCampaignProgress
  );

  const goTo = (nextScreen: Screen): void => {
    if (nextScreen === 'levels') {
      void refreshCampaignProgress();
    }
    setScreen(nextScreen);
  };

  const skipBoot = (): void => {
    if (bootTransitionTimer.current !== null) {
      window.clearTimeout(bootTransitionTimer.current);
      bootTransitionTimer.current = null;
    }
    goTo('menu');
  };

  const finishBootAnimation = (): void => {
    if (bootTransitionTimer.current !== null) return;
    bootTransitionTimer.current = window.setTimeout(() => {
      bootTransitionTimer.current = null;
      goTo('menu');
    }, 0);
  };

  let content;
  switch (screen) {
    case 'boot':
      content = (
        <BootScreen
          onSkip={skipBoot}
          onAnimationEnd={finishBootAnimation}
        />
      );
      break;
    case 'menu':
      content = (
        <MenuScreen
          goTo={goTo}
          streak={streak}
          onPlayDaily={() => {
            setSelectedLevel(DAILY_LEVEL_ID);
            goTo('play');
          }}
          onOpenLevels={() => goTo('levels')}
        />
      );
      break;
    case 'levels':
      content = (
        <LevelsScreen
          goTo={goTo}
          selectedLevel={selectedLevel}
          levels={getCampaignLevels()}
          progress={campaignProgress}
          onSelectSector={(levelId) => {
            const playableLevel = getLevelById(levelId);
            if (!playableLevel) return;
            setSelectedLevel(playableLevel.id);
            goTo('play');
          }}
        />
      );
      break;
    case 'tutorial':
      content = <TutorialScreen goTo={goTo} />;
      break;
    case 'play':
      content = (
        <PlayScreen
          initialLevelId={selectedLevel}
          goTo={goTo}
          onWin={async (
            levelId,
            hintsUsed,
            finalCost,
            targetCost,
            partsUsed,
            durationSeconds,
            isDaily
          ) => {
            setSelectedLevel(levelId);
            let nextLevelId: number | null = null;
            let progressError: string | null = null;
            let dailyStreak: number | null = null;
            let distribution: CommunityDistribution | null = null;
            let dailyResultSaved = false;
            let resultError: string | null = null;
            let resultNotice: string | null = null;

            if (isDaily) {
              try {
                const result = await submitScore({
                  levelId: DAILY_LEVEL_ID,
                  cost: finalCost,
                  targetCost,
                  parts: partsUsed,
                  hintsUsed,
                  durationSeconds,
                });
                dailyStreak = result.streak;
                dailyResultSaved = true;
                resultNotice = result.integrationWarnings.join(' ') || null;
                await refreshDailyState(DAILY_LEVEL_ID);
                distribution = await getCommunityDistribution(DAILY_LEVEL_ID);
              } catch (error) {
                console.error('Unable to save daily circuit result:', error);
                resultError = error instanceof Error
                  ? error.message
                  : 'Daily result could not be saved.';
              }
            } else {
              if (levelId < CAMPAIGN_LEVEL_COUNT) {
                nextLevelId = levelId + 1;
              }
              try {
                await recordCampaignCompletion(
                  levelId,
                  gradeFor(finalCost, targetCost)
                );
              } catch (error) {
                console.error('Unable to save campaign completion:', error);
                progressError = error instanceof Error
                  ? error.message
                  : 'Campaign progress could not be saved.';
                nextLevelId = null;
              }
            }
            setCompletedRun({
              hintsUsed,
              finalCost,
              targetCost,
              nextLevelId,
              progressError,
              isDaily,
              dailyStreak,
              distribution,
              dailyResultSaved,
              resultError,
              resultNotice,
            });
            goTo('win');
          }}
        />
      );
      break;
    case 'win':
      content = (
        <WinScreen
          goTo={goTo}
          {...completedRun}
          onNextLevel={(levelId) => {
            setSelectedLevel(levelId);
            goTo('play');
          }}
        />
      );
      break;
  }

  return content;
};

const rootElement = document.getElementById('root') ?? document.body;
createRoot(rootElement).render(<App />);
