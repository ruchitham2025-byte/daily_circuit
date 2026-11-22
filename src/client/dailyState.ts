export type GradeDistribution = {
  sPlus: number;
  a: number;
  b: number;
  c: number;
};

export type PlayerStats = {
  streak: number;
  totalPuzzles: number;
  averageCost: number | null;
  personalBest: number | null;
  personalBests: { levelId: number; cost: number | null }[];
  bestTimeSeconds: number | null;
  efficiencyRating: string;
};

export type DailyStateData = {
  totalCompletions: number;
  globalAverageCost: number | null;
  gradeDistribution: GradeDistribution;
  playerCompletions: number;
  playerStats: PlayerStats;
};

export type CommunityDistribution = {
  total: number;
  gradeDistribution: GradeDistribution;
  playerGrade: 'S' | 'A' | 'B' | 'C' | null;
};

export type DailyStateSnapshot =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: DailyStateData };

export type ScoreResult = {
  streak: number;
  integrationWarnings: string[];
};

export type ShareResult = {
  alreadyShared: boolean;
};

const loadingSnapshot: DailyStateSnapshot = { status: 'loading' };
const snapshots = new Map<number, DailyStateSnapshot>();
const listeners = new Set<() => void>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const parseDailyState = (value: unknown): DailyStateData | undefined => {
  if (
    !isRecord(value) ||
    !isRecord(value.gradeDistribution) ||
    !isRecord(value.playerStats)
  ) {
    return undefined;
  }

  const { gradeDistribution, playerStats } = value;
  const globalAverageCost = value.globalAverageCost;
  const averageCost = playerStats.averageCost;
  const personalBest = playerStats.personalBest;
  const personalBests = playerStats.personalBests;
  const bestTimeSeconds = playerStats.bestTimeSeconds;

  if (
    !isFiniteNumber(value.totalCompletions) ||
    !isFiniteNumber(value.playerCompletions) ||
    (globalAverageCost !== null && !isFiniteNumber(globalAverageCost)) ||
    !isFiniteNumber(gradeDistribution.sPlus) ||
    !isFiniteNumber(gradeDistribution.a) ||
    !isFiniteNumber(gradeDistribution.b) ||
    !isFiniteNumber(gradeDistribution.c) ||
    !isFiniteNumber(playerStats.streak) ||
    !isFiniteNumber(playerStats.totalPuzzles) ||
    (averageCost !== null && !isFiniteNumber(averageCost)) ||
    (personalBest !== null && !isFiniteNumber(personalBest)) ||
    !Array.isArray(personalBests) ||
    personalBests.length !== 3 ||
    (bestTimeSeconds !== null && !isFiniteNumber(bestTimeSeconds)) ||
    typeof playerStats.efficiencyRating !== 'string'
  ) {
    return undefined;
  }

  const parsedPersonalBests: { levelId: number; cost: number | null }[] = [];
  for (const best of personalBests) {
    if (
      !isRecord(best) ||
      !isFiniteNumber(best.levelId) ||
      (best.cost !== null && !isFiniteNumber(best.cost))
    ) {
      return undefined;
    }
    parsedPersonalBests.push({ levelId: best.levelId, cost: best.cost });
  }

  return {
    totalCompletions: value.totalCompletions,
    globalAverageCost,
    gradeDistribution: {
      sPlus: gradeDistribution.sPlus,
      a: gradeDistribution.a,
      b: gradeDistribution.b,
      c: gradeDistribution.c,
    },
    playerCompletions: value.playerCompletions,
    playerStats: {
      streak: playerStats.streak,
      totalPuzzles: playerStats.totalPuzzles,
      averageCost,
      personalBest,
      personalBests: parsedPersonalBests,
      bestTimeSeconds,
      efficiencyRating: playerStats.efficiencyRating,
    },
  };
};

export const subscribeDailyState = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getDailyState = (levelId: number): DailyStateSnapshot =>
  snapshots.get(levelId) ?? loadingSnapshot;

const notifyListeners = (): void => {
  listeners.forEach((listener) => listener());
};

export const refreshDailyState = async (levelId: number): Promise<void> => {
  snapshots.set(levelId, loadingSnapshot);
  notifyListeners();

  try {
    const response = await fetch(`/api/daily-state?levelId=${levelId}`);
    if (!response.ok) {
      throw new Error(`Daily telemetry request failed (${response.status})`);
    }

    const payload: unknown = await response.json();
    const data = parseDailyState(payload);
    if (!data) {
      throw new Error('Daily telemetry response was invalid');
    }
    snapshots.set(levelId, { status: 'ready', data });
  } catch (error) {
    console.error('Unable to load daily telemetry:', error);
    snapshots.set(levelId, { status: 'error' });
  }

  notifyListeners();
};

export const submitScore = async (
  score: {
    levelId: number;
    cost: number;
    targetCost?: number;
    parts: number;
    hintsUsed: number;
    durationSeconds: number;
  }
): Promise<ScoreResult> => {
  const response = await fetch('/api/submit-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(score),
  });

  if (!response.ok) {
    throw new Error(`Score submission failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || payload.success !== true || !isFiniteNumber(payload.streak)) {
    throw new Error('Score submission was not accepted');
  }

  const integrationWarnings = Array.isArray(payload.integrationWarnings)
    ? payload.integrationWarnings.filter(
        (warning): warning is string => typeof warning === 'string'
      )
    : [];

  return { streak: payload.streak, integrationWarnings };
};

export const getCommunityDistribution = async (
  levelId: number
): Promise<CommunityDistribution> => {
  const response = await fetch(
    `/api/community-distribution?levelId=${levelId}`
  );
  if (!response.ok) {
    throw new Error(
      `Community distribution request failed (${response.status})`
    );
  }

  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    !isFiniteNumber(payload.total) ||
    !isRecord(payload.gradeDistribution) ||
    !isFiniteNumber(payload.gradeDistribution.sPlus) ||
    !isFiniteNumber(payload.gradeDistribution.a) ||
    !isFiniteNumber(payload.gradeDistribution.b) ||
    !isFiniteNumber(payload.gradeDistribution.c) ||
    (payload.playerGrade !== null &&
      payload.playerGrade !== 'S' &&
      payload.playerGrade !== 'A' &&
      payload.playerGrade !== 'B' &&
      payload.playerGrade !== 'C')
  ) {
    throw new Error('Community distribution response was invalid');
  }

  return {
    total: payload.total,
    gradeDistribution: {
      sPlus: payload.gradeDistribution.sPlus,
      a: payload.gradeDistribution.a,
      b: payload.gradeDistribution.b,
      c: payload.gradeDistribution.c,
    },
    playerGrade: payload.playerGrade,
  };
};

export const shareDailyResult = async (): Promise<ShareResult> => {
  const response = await fetch('/api/share-result', { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Sharing the daily result failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (
    !isRecord(payload) ||
    payload.success !== true ||
    typeof payload.alreadyShared !== 'boolean'
  ) {
    throw new Error('Daily result share was not accepted');
  }

  return { alreadyShared: payload.alreadyShared };
};

void refreshDailyState(1);
