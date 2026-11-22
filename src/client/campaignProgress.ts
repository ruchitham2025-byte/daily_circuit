export type CampaignGrade = 'S' | 'A' | 'B' | 'C';

export type CampaignProgressData = {
  unlockedThrough: number;
  bestGrades: Record<number, CampaignGrade>;
};

export type CampaignProgressSnapshot =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: CampaignProgressData };

const loadingSnapshot: CampaignProgressSnapshot = { status: 'loading' };
let snapshot: CampaignProgressSnapshot = loadingSnapshot;
const listeners = new Set<() => void>();

const STORAGE_KEY = 'daily-circuit:campaign-progress';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGrade = (value: unknown): value is CampaignGrade =>
  value === 'S' || value === 'A' || value === 'B' || value === 'C';

const GRADE_ORDER: CampaignGrade[] = ['S', 'A', 'B', 'C'];

const notifyListeners = (): void => {
  listeners.forEach((listener) => listener());
};

const loadLocalProgress = (): CampaignProgressData => {
  try {
    if (typeof window === 'undefined') return { unlockedThrough: 0, bestGrades: {} };
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { unlockedThrough: 0, bestGrades: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { unlockedThrough: 0, bestGrades: {} };

    const bestGrades: Record<number, CampaignGrade> = {};
    if (isRecord(parsed.bestGrades)) {
      for (const [key, value] of Object.entries(parsed.bestGrades)) {
        const id = Number(key);
        if (Number.isSafeInteger(id) && id >= 1 && id <= 30 && isGrade(value)) {
          bestGrades[id] = value;
        }
      }
    }

    let unlockedThrough = 0;
    const storedUnlocked = parsed.unlockedThrough;
    if (typeof storedUnlocked === 'number' && Number.isSafeInteger(storedUnlocked)) {
      unlockedThrough = Math.max(0, Math.min(30, storedUnlocked));
    } else {
      for (let id = 1; id <= 30; id += 1) {
        if (bestGrades[id] === undefined) break;
        unlockedThrough = id;
      }
    }

    return { unlockedThrough, bestGrades };
  } catch {
    return { unlockedThrough: 0, bestGrades: {} };
  }
};

const saveLocalProgress = (data: CampaignProgressData): void => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
};

export const subscribeCampaignProgress = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCampaignProgress = (): CampaignProgressSnapshot => snapshot;

export const refreshCampaignProgress = async (): Promise<void> => {
  snapshot = loadingSnapshot;
  notifyListeners();

  try {
    if (import.meta.env.DEV || !navigator.onLine) throw new Error('Local session');
    const response = await fetch('/api/campaign-progress', {signal:AbortSignal.timeout(4000)});
    if (!response.ok) {
      throw new Error(`Campaign progress request failed (${response.status})`);
    }

    const payload: unknown = await response.json();
    if (
      !isRecord(payload) ||
      payload.success !== true ||
      typeof payload.unlockedThrough !== 'number' ||
      !Number.isSafeInteger(payload.unlockedThrough) ||
      payload.unlockedThrough < 0 ||
      payload.unlockedThrough > 30 ||
      !isRecord(payload.bestGrades)
    ) {
      throw new Error('Campaign progress response was invalid');
    }

    const bestGrades: Record<number, CampaignGrade> = {};
    for (const [levelKey, grade] of Object.entries(payload.bestGrades)) {
      const levelId = Number(levelKey);
      if (
        !Number.isSafeInteger(levelId) ||
        levelId < 1 ||
        levelId > 30 ||
        !isGrade(grade)
      ) {
        throw new Error('Campaign progress contained an invalid best grade');
      }
      bestGrades[levelId] = grade;
    }

    const data = {
      unlockedThrough: payload.unlockedThrough,
      bestGrades,
    };
    saveLocalProgress(data);
    snapshot = { status: 'ready', data };
  } catch {
    const local = loadLocalProgress();
    snapshot = { status: 'ready', data: local };
  }

  notifyListeners();
};

export const recordCampaignCompletion = async (
  levelId: number,
  grade: CampaignGrade
): Promise<void> => {
  try {
    if (import.meta.env.DEV || !navigator.onLine) throw new Error('Local session');
    const response = await fetch('/api/campaign-progress', {
      signal:AbortSignal.timeout(4000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ levelId, grade }),
    });

    if (!response.ok) {
      throw new Error(`Campaign completion could not be saved (${response.status})`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || payload.success !== true) {
      throw new Error('Campaign completion was not accepted');
    }

    await refreshCampaignProgress();
    if (snapshot.status !== 'ready') {
      throw new Error('Campaign completion saved, but progress could not be refreshed');
    }
  } catch {
    const local = loadLocalProgress();
    const previousBest = local.bestGrades[levelId];
    const previousRank = previousBest ? GRADE_ORDER.indexOf(previousBest) : -1;
    const nextRank = GRADE_ORDER.indexOf(grade);
    if (previousRank < 0 || nextRank < previousRank) {
      local.bestGrades[levelId] = grade;
    }
    if (levelId > local.unlockedThrough) {
      local.unlockedThrough = levelId;
    }
    saveLocalProgress(local);
    snapshot = { status: 'ready', data: local };
    notifyListeners();
  }
};
