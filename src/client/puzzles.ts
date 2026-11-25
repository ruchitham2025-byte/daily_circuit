import catalog from './sectors.json' with { type: 'json' };
import type { Puzzle } from './rules.ts';

export type Chapter = {
  id: number;
  title: string;
  subtitle: string;
  startLevel: number;
  endLevel: number;
};

export const CHAPTERS: readonly Chapter[] = [
  { id: 1, title: 'BOOT PROTOCOL', subtitle: 'Learn the ropes', startLevel: 1, endLevel: 10 },
  { id: 2, title: 'POWER SURGE', subtitle: 'Boosters & splitters', startLevel: 11, endLevel: 20 },
  { id: 3, title: 'DEEP CIRCUIT', subtitle: 'Complex routing', startLevel: 21, endLevel: 30 },
  { id: 4, title: 'HIGH VOLTAGE', subtitle: 'Master class', startLevel: 31, endLevel: 40 },
  { id: 5, title: 'FINAL FRONTIER', subtitle: 'Elite tier', startLevel: 41, endLevel: 50 },
];

export const getChapterForLevel = (levelId: number): Chapter | undefined =>
  CHAPTERS.find((c) => levelId >= c.startLevel && levelId <= c.endLevel);
export const CAMPAIGN_LEVEL_COUNT = 50;
export const DAILY_LEVEL_ID = CAMPAIGN_LEVEL_COUNT + 1;
export type DailyLevel = Puzzle & {
  id: number;
  mode: 'daily' | 'campaign';
  title: string;
  date: string;
  targetCost: number;
  difficulty: string;
};
const sectors: DailyLevel[] = catalog.map((level) => ({
  ...level,
  mode: 'campaign',
}));
export const getCampaignLevels = () => sectors;
export function dailyLayout(now = new Date()) {
  const day = Math.floor(now.getTime() / 86400000);
  let seed = day >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const transform = (i: number) => {
    let x = i % 6,
      y = Math.floor(i / 6);
    if (day % 8 >= 4) x = 5 - x;
    for (let n = 0; n < day % 4; n++) {
      [x, y] = [5 - y, x];
    }
    return y * 6 + x;
  };
  const top = day % 3 === 0 ? 4 : 5,
    bottom = day % 5 < 2 ? 30 : 35;
  const upper = [12, 13, 14, 15, 9, 3, 4, ...(top === 5 ? [5] : [])];
  const lower = [
    15,
    21,
    27,
    ...(bottom === 30 ? [26, 25, 24, 30] : [28, 29, 35]),
  ];
  const used = new Set([...upper, ...lower]);
  const available = Array.from({ length: 36 }, (_, i) => i).filter(
    (i) => !used.has(i)
  );
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const current = available[i];
    const swap = available[j];
    if (current !== undefined && swap !== undefined) {
      available[i] = swap;
      available[j] = current;
    }
  }
  const fixed = [12, 15, 27, top, bottom];
  const hazards = available
    .filter((i) =>
      fixed.every(
        (j) =>
          Math.abs((i % 6) - (j % 6)) +
            Math.abs(Math.floor(i / 6) - Math.floor(j / 6)) >
          1
      )
    )
    .slice(0, 2);
  const level: DailyLevel = {
    size: 6,
    id: DAILY_LEVEL_ID,
    title: 'Daily Circuit',
    mode: 'daily',
    date: now.toISOString().slice(0, 10),
    difficulty: 'STANDARD',
    source: transform(12),
    boosters: [15, 27].map(transform),
    targets: [
      { index: transform(top), voltage: top === 5 ? 1 : 2 },
      { index: transform(bottom), voltage: bottom === 30 ? 1 : 2 },
    ],
    walls: available
      .filter((i) => !hazards.includes(i))
      .slice(0, 3)
      .map(transform),
    hazards: hazards.map(transform),
    targetCost: 0,
  };
  const directions = (a: number, b: number) =>
    b === a - 6 ? 0 : b === a + 1 ? 1 : b === a + 6 ? 2 : 3;
  const solution = new Map<number, { type: number; rotation: number }>();
  for (const path of [upper, lower]) {
    for (let j = 1; j < path.length - 1; j++) {
      const i = path[j];
      const previous = path[j - 1];
      const next = path[j + 1];
      if (i === undefined || previous === undefined || next === undefined) continue;
      if (fixed.includes(i)) continue;
      const cell = transform(i);
      const a = directions(cell, transform(previous));
      const b = directions(cell, transform(next));
      const straight = Math.abs(a - b) === 2;
      solution.set(cell, {
        type: straight ? 1 : 2,
        rotation: straight ? a % 2 : (a + 1) % 4 === b ? a : b,
      });
      level.targetCost += straight ? 10 : 15;
    }
  }
  return { level, solution };
}
export const getDailyLevel = (now = new Date()) => dailyLayout(now).level;
export const getLevelById = (id: number) =>
  id === DAILY_LEVEL_ID ? getDailyLevel() : sectors.find((l) => l.id === id);
