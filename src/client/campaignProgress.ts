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
const errorSnapshot: CampaignProgressSnapshot = { status: 'error' };
let snapshot: CampaignProgressSnapshot = loadingSnapshot;
const listeners = new Set<() => void>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGrade = (value: unknown): value is CampaignGrade =>
  value === 'S' || value === 'A' || value === 'B' || value === 'C';

const notifyListeners = (): void => {
  listeners.forEach((listener) => listener());
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
    const response = await fetch('/api/campaign-progress');
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

    snapshot = {
      status: 'ready',
      data: {
        unlockedThrough: payload.unlockedThrough,
        bestGrades,
      },
    };
  } catch (error) {
    console.error('Unable to load campaign progress:', error);
    snapshot = errorSnapshot;
  }

  notifyListeners();
};

export const recordCampaignCompletion = async (
  levelId: number,
  grade: CampaignGrade
): Promise<void> => {
  const response = await fetch('/api/campaign-progress', {
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
};
