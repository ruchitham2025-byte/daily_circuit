import { generate, type GeneratedLevel } from './generator.ts';
import { campaignSectorTitle } from './sectorProgress.ts';
import type { Puzzle } from './rules.ts';

export const DAILY_LEVEL_ID = 31;
export const CAMPAIGN_LEVEL_COUNT = 30;

export type DailyLevel = Puzzle & {
  id: number;
  mode: 'daily' | 'campaign';
  title: string;
  date: string;
  targetCost: number;
  difficulty: string;
};

const campaignSize = (level: number): number =>
  level <= 5 ? 5 : Math.min(10, 5 + Math.floor((level - 6) / 5));

const dailyDifficultySize = (difficulty: number): number =>
  Math.min(10, 5 + Math.floor((difficulty - 1) / 5));

const toDailyLevel = (
  generated: GeneratedLevel,
  id: number,
  mode: DailyLevel['mode'],
  title: string,
  date: string
): DailyLevel => ({
  id,
  mode,
  title,
  date,
  targetCost: generated.targetCost,
  difficulty: `TIER ${generated.difficulty}`,
  size: generated.size,
  source: generated.source,
  targets: generated.targets,
  boosters: generated.boosters,
  walls: generated.walls,
  hazards: generated.hazards,
});

let campaignCache: DailyLevel[] | undefined;
const dailyLevelCache = new Map<string, DailyLevel>();

export const getCampaignLevels = (): DailyLevel[] => {
  if (campaignCache) return campaignCache;

  campaignCache = Array.from({ length: CAMPAIGN_LEVEL_COUNT }, (_, index) => {
    const id = index + 1;
    const generated = generate(0x44430000 + id, campaignSize(id), id);
    if (!generated) {
      throw new Error(`Unable to generate campaign sector ${id}.`);
    }

    return toDailyLevel(
      generated,
      id,
      'campaign',
      campaignSectorTitle(id),
      `SECTOR ${String(id).padStart(2, '0')}`
    );
  });

  return campaignCache;
};

export const getDailyLevel = (now = new Date()): DailyLevel => {
  const date = now.toISOString().slice(0, 10);
  const cachedLevel = dailyLevelCache.get(date);
  if (cachedLevel) return cachedLevel;

  const utcDay = Math.floor(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ) / 86_400_000);
  const rawDifficulty = (utcDay % 30) + 1;
  const difficulty = Math.max(6, rawDifficulty);
  const minDailySize = Math.max(7, dailyDifficultySize(difficulty));
  const generated = generate(
    utcDay,
    minDailySize,
    difficulty
  );
  if (!generated) {
    throw new Error(`Unable to generate the daily circuit for ${date}.`);
  }

  const dailyLevel = toDailyLevel(
    generated,
    DAILY_LEVEL_ID,
    'daily',
    'DAILY CIRCUIT',
    date
  );
  dailyLevelCache.set(date, dailyLevel);
  return dailyLevel;
};

export const getLevelById = (id: number): DailyLevel | undefined =>
  id === DAILY_LEVEL_ID
    ? getDailyLevel()
    : getCampaignLevels().find((level) => level.id === id);
