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
  | { status: 'ready'; data: DailyStateData; preview: boolean };

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

const STORAGE_KEY = 'daily-circuit:local-stats';
const PREVIEW_FLAG_KEY = 'daily-circuit:preview-mode';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isPreviewMode = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    return import.meta.env.DEV || !navigator.onLine || window.sessionStorage.getItem(PREVIEW_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
};

const setPreviewMode = (): void => {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(PREVIEW_FLAG_KEY, 'true');
    }
  } catch {
    // ignore storage errors
  }
};

type LocalStats = {
  lastDay?: number;
  streak: number;
  totalPuzzles: number;
  totalCost: number;
  bestCost: number | null;
  bestTime: number | null;
  gradeCounts: GradeDistribution;
  completions: number;
};

const emptyLocalStats: LocalStats = {
  streak: 0,
  totalPuzzles: 0,
  totalCost: 0,
  bestCost: null,
  bestTime: null,
  gradeCounts: { sPlus: 0, a: 0, b: 0, c: 0 },
  completions: 0,
};

const loadLocalStats = (): LocalStats => {
  try {
    if (typeof window === 'undefined') return { ...emptyLocalStats };
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...emptyLocalStats };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...emptyLocalStats };
    return {
      ...(isFiniteNumber(parsed.lastDay) ? {lastDay:parsed.lastDay} : {}),
      streak: isFiniteNumber(parsed.streak) ? parsed.streak : 0,
      totalPuzzles: isFiniteNumber(parsed.totalPuzzles) ? parsed.totalPuzzles : 0,
      totalCost: isFiniteNumber(parsed.totalCost) ? parsed.totalCost : 0,
      bestCost: parsed.bestCost === null || isFiniteNumber(parsed.bestCost) ? parsed.bestCost : null,
      bestTime: parsed.bestTime === null || isFiniteNumber(parsed.bestTime) ? parsed.bestTime : null,
      gradeCounts: isRecord(parsed.gradeCounts)
        ? {
            sPlus: isFiniteNumber(parsed.gradeCounts.sPlus) ? parsed.gradeCounts.sPlus : 0,
            a: isFiniteNumber(parsed.gradeCounts.a) ? parsed.gradeCounts.a : 0,
            b: isFiniteNumber(parsed.gradeCounts.b) ? parsed.gradeCounts.b : 0,
            c: isFiniteNumber(parsed.gradeCounts.c) ? parsed.gradeCounts.c : 0,
          }
        : { sPlus: 0, a: 0, b: 0, c: 0 },
      completions: isFiniteNumber(parsed.completions) ? parsed.completions : 0,
    };
  } catch {
    return { ...emptyLocalStats };
  }
};

const saveLocalStats = (stats: LocalStats): void => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore storage errors
  }
};

const gradeForCost = (cost: number, targetCost: number): 'S' | 'A' | 'B' | 'C' => {
  if (cost <= targetCost) return 'S';
  if (cost <= targetCost * 1.15) return 'A';
  if (cost <= targetCost * 1.3) return 'B';
  return 'C';
};

const fieldForGrade = (grade: 'S' | 'A' | 'B' | 'C'): keyof GradeDistribution => {
  if (grade === 'S') return 'sPlus';
  if (grade === 'A') return 'a';
  if (grade === 'B') return 'b';
  return 'c';
};

const seedMockDistribution = (): GradeDistribution => {
  const seed = Math.floor(Date.now() / 86_400_000) * 7919;
  return {
    sPlus: 128 + (seed % 73),
    a: 214 + (seed % 51),
    b: 89 + (seed % 37),
    c: 34 + (seed % 19),
  };
};

const buildLocalState = (stats: LocalStats): DailyStateData => {
  const mockDist = seedMockDistribution();
  const gradeDist: GradeDistribution = {
    sPlus: mockDist.sPlus + stats.gradeCounts.sPlus,
    a: mockDist.a + stats.gradeCounts.a,
    b: mockDist.b + stats.gradeCounts.b,
    c: mockDist.c + stats.gradeCounts.c,
  };
  const grades: { grade: 'S' | 'A' | 'B' | 'C'; count: number }[] = [
    { grade: 'S', count: stats.gradeCounts.sPlus },
    { grade: 'A', count: stats.gradeCounts.a },
    { grade: 'B', count: stats.gradeCounts.b },
    { grade: 'C', count: stats.gradeCounts.c },
  ];
  grades.sort((l, r) => r.count - l.count);
  const top = grades[0];
  return {
    totalCompletions: stats.completions + mockDist.sPlus + mockDist.a + mockDist.b + mockDist.c,
    globalAverageCost: stats.totalPuzzles > 0 ? stats.totalCost / stats.totalPuzzles : null,
    gradeDistribution: gradeDist,
    playerCompletions: stats.completions,
    playerStats: {
      streak: stats.streak,
      totalPuzzles: stats.totalPuzzles,
      averageCost: stats.totalPuzzles > 0 ? stats.totalCost / stats.totalPuzzles : null,
      personalBest: stats.bestCost,
      personalBests: [
        { levelId: 1, cost: stats.bestCost },
        { levelId: 2, cost: null },
        { levelId: 3, cost: null },
      ],
      bestTimeSeconds: stats.bestTime,
      efficiencyRating: top && top.count > 0 ? top.grade : '—',
    },
  };
};

const parseDailyState = (value: unknown): DailyStateData | undefined => {
  if (!isRecord(value) || !isRecord(value.gradeDistribution) || !isRecord(value.playerStats)) {
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
    if (isPreviewMode()) throw new Error('Local session');
    const response = await fetch(`/api/daily-state?levelId=${levelId}`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) {
      throw new Error(`Daily telemetry request failed (${response.status})`);
    }

    const payload: unknown = await response.json();
    const data = parseDailyState(payload);
    if (!data) {
      throw new Error('Daily telemetry response was invalid');
    }
    snapshots.set(levelId, { status: 'ready', data, preview: false });
  } catch {
    setPreviewMode();
    const local = loadLocalStats();
    snapshots.set(levelId, { status: 'ready', data: buildLocalState(local), preview: true });
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
  try {
    if (isPreviewMode()) throw new Error('Local session');
    const response = await fetch('/api/submit-score', {
      signal: AbortSignal.timeout(4000),
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
  } catch {
    setPreviewMode();
    const stats = loadLocalStats();
    const targetCost = score.targetCost ?? 100;
    const grade = gradeForCost(score.cost, targetCost);
    stats.completions += 1;
    stats.totalPuzzles += 1;
    stats.totalCost += score.cost;
    stats.gradeCounts[fieldForGrade(grade)] += 1;
    if (stats.bestCost === null || score.cost < stats.bestCost) {
      stats.bestCost = score.cost;
    }
    if (stats.bestTime === null || score.durationSeconds < stats.bestTime) {
      stats.bestTime = score.durationSeconds;
    }
    const day = Math.floor(Date.now() / 86400000);
    if (stats.lastDay !== day) stats.streak = stats.lastDay === day - 1 ? stats.streak + 1 : 1;
    stats.lastDay = day;
    saveLocalStats(stats);
    void refreshDailyState(score.levelId);
    return { streak: stats.streak, integrationWarnings: [] };
  }
};

export const getCommunityDistribution = async (
  levelId: number
): Promise<CommunityDistribution> => {
  try {
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
  } catch (error) {
    console.error('Unable to load community distribution, using mock:', error);
    setPreviewMode();
    const stats = loadLocalStats();
    const mockDist = seedMockDistribution();
    return {
      total: mockDist.sPlus + mockDist.a + mockDist.b + mockDist.c + stats.completions,
      gradeDistribution: {
        sPlus: mockDist.sPlus + stats.gradeCounts.sPlus,
        a: mockDist.a + stats.gradeCounts.a,
        b: mockDist.b + stats.gradeCounts.b,
        c: mockDist.c + stats.gradeCounts.c,
      },
      playerGrade: null,
    };
  }
};

export const shareDailyResult = async (
  levelDate?: string,
  grade?: string,
  cost?: number,
  targetCost?: number,
  hintsUsed?: number
): Promise<ShareResult> => {
  try {
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
  } catch (error) {
    console.error('Unable to share via Devvit, copying to clipboard:', error);
    const date = levelDate ?? new Date().toISOString().slice(0, 10);
    const rank = grade ?? '—';
    const spent = cost ?? 0;
    const target = targetCost ?? 0;
    const hints = hintsUsed ?? 0;
    const summary = `⚡ Daily Circuit #${date} — Grade ${rank} | ${spent} / ${target} | ${hints} Hints`;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(summary);
      }
    } catch {
      // clipboard may be unavailable; still return success since we tried
    }

    return { alreadyShared: false };
  }
};

void refreshDailyState(1);
