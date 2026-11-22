import { context, reddit, redis } from '@devvit/web/server';
import { Hono } from 'hono';

type Grade = 'S' | 'A' | 'B' | 'C';
type GradeField = 'sPlus' | 'a' | 'b' | 'c';

type ScoreSubmission = {
  levelId: number;
  cost: number;
  targetCost?: number;
  parts: number;
  hintsUsed: number;
  durationSeconds: number;
};

const TARGET_COST_BY_LEVEL: Record<number, number> = {
  1: 135,
  2: 155,
  3: 170,
};
const DAILY_KEY_TTL_SECONDS = 14 * 24 * 60 * 60;
const MAX_HARDWARE_COST = 10_000;
const MAX_PARTS = 49;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const CAMPAIGN_LEVEL_COUNT = 30;
const GRADE_ORDER: Grade[] = ['S', 'A', 'B', 'C'];

export const api = new Hono();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseLevelId = (value: string | undefined): number | undefined => {
  if (value === undefined) return 1;
  if (!/^[1-9]\d*$/.test(value)) return undefined;

  const levelId = Number(value);
  return Number.isSafeInteger(levelId) && levelId in TARGET_COST_BY_LEVEL
    ? levelId
    : undefined;
};

const parseScoreSubmission = (value: unknown): ScoreSubmission | undefined => {
  if (!isRecord(value)) return undefined;

  const { levelId, cost, targetCost, parts, hintsUsed, durationSeconds } = value;
  if (
    typeof levelId !== 'number' ||
    !Number.isSafeInteger(levelId) ||
    !(levelId in TARGET_COST_BY_LEVEL) ||
    typeof cost !== 'number' ||
    !Number.isSafeInteger(cost) ||
    cost < 0 ||
    cost > MAX_HARDWARE_COST ||
    (targetCost !== undefined &&
      (typeof targetCost !== 'number' ||
        !Number.isSafeInteger(targetCost) ||
        targetCost <= 0 ||
        targetCost > MAX_HARDWARE_COST)) ||
    typeof parts !== 'number' ||
    !Number.isSafeInteger(parts) ||
    parts < 0 ||
    parts > MAX_PARTS ||
    typeof hintsUsed !== 'number' ||
    !Number.isSafeInteger(hintsUsed) ||
    hintsUsed < 0 ||
    hintsUsed > MAX_PARTS ||
    typeof durationSeconds !== 'number' ||
    !Number.isSafeInteger(durationSeconds) ||
    durationSeconds < 0 ||
    durationSeconds > MAX_DURATION_SECONDS
  ) {
    return undefined;
  }

  return {
    levelId,
    cost,
    ...(typeof targetCost === 'number' ? { targetCost } : {}),
    parts,
    hintsUsed,
    durationSeconds,
  };
};

const gradeForCost = (cost: number, targetCost: number): Grade => {
  if (cost <= targetCost) return 'S';
  if (cost <= targetCost * 1.15) return 'A';
  if (cost <= targetCost * 1.3) return 'B';
  return 'C';
};

const fieldForGrade = (grade: Grade): GradeField => {
  if (grade === 'S') return 'sPlus';
  if (grade === 'A') return 'a';
  if (grade === 'B') return 'b';
  return 'c';
};

const currentDay = (): string => new Date().toISOString().slice(0, 10);
const getUserId = (): string =>
  context.userId ?? context.loid ?? context.username ?? 'anonymous';
const dailyLevelKey = (day: string, levelId: number): string =>
  `daily:${day}:level:${levelId}`;
const parseCount = (value: string | undefined): number => {
  if (value === undefined) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const isStreakActive = (
  lastCompletedDay: string | undefined,
  day: string
): boolean => {
  if (!lastCompletedDay) return false;
  if (lastCompletedDay === day) return true;

  const yesterday = new Date(`${day}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return lastCompletedDay === yesterday.toISOString().slice(0, 10);
};

const activeStreak = (
  count: string | undefined,
  lastCompletedDay: string | undefined,
  day: string
): number => (isStreakActive(lastCompletedDay, day) ? parseCount(count) : 0);

const campaignProgressKey = (userId: string): string =>
  `user:${userId}:circuit:campaign`;

const isGrade = (value: unknown): value is Grade =>
  value === 'S' || value === 'A' || value === 'B' || value === 'C';

api.get('/campaign-progress', async (c) => {
  try {
    const progress = await redis.hGetAll(campaignProgressKey(getUserId()));
    let unlockedThrough = 0;
    for (let levelId = 1; levelId <= CAMPAIGN_LEVEL_COUNT; levelId += 1) {
      if (!isGrade(progress[String(levelId)])) break;
      unlockedThrough = levelId;
    }

    const bestGrades: Record<string, Grade> = {};
    for (let levelId = 1; levelId <= CAMPAIGN_LEVEL_COUNT; levelId += 1) {
      const grade = progress[String(levelId)];
      if (isGrade(grade)) bestGrades[String(levelId)] = grade;
    }

    return c.json({ success: true, unlockedThrough, bestGrades });
  } catch (error: unknown) {
    console.error('Failed to load campaign progression:', error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 500);
  }
});

api.post('/campaign-progress', async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(
      { success: false, error: 'Request body must be valid JSON' },
      400
    );
  }

  if (
    !isRecord(payload) ||
    typeof payload.levelId !== 'number' ||
    !Number.isSafeInteger(payload.levelId) ||
    payload.levelId < 1 ||
    payload.levelId > CAMPAIGN_LEVEL_COUNT ||
    !isGrade(payload.grade)
  ) {
    return c.json(
      { success: false, error: 'A valid campaign levelId and grade are required' },
      400
    );
  }

  try {
    const userId = getUserId();
    const progressKey = campaignProgressKey(userId);
    const { levelId, grade } = payload;
    if (levelId > 1) {
      const previousGrade = await redis.hGet(progressKey, String(levelId - 1));
      if (!isGrade(previousGrade)) {
        return c.json(
          { success: false, error: 'Complete the previous sector first' },
          403
        );
      }
    }

    const previousBest = await redis.hGet(progressKey, String(levelId));
    const previousRank = isGrade(previousBest)
      ? GRADE_ORDER.indexOf(previousBest)
      : -1;
    const nextRank = GRADE_ORDER.indexOf(grade);
    if (previousRank < 0 || nextRank < previousRank) {
      await redis.hSet(progressKey, { [String(levelId)]: grade });
    }

    return c.json({ success: true });
  } catch (error: unknown) {
    console.error('Failed to save campaign progression:', error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 500);
  }
});

api.get('/daily-state', async (c) => {
  const levelId = parseLevelId(c.req.query('levelId'));
  if (levelId === undefined) {
    return c.json({ success: false, error: 'Invalid levelId' }, 400);
  }

  try {
    const day = currentDay();
    const userId = getUserId();
    const statsKey = `${dailyLevelKey(day, levelId)}:stats`;
    const userStatsKey = `user:${userId}:circuit:stats`;
    const streakKey = `user:${userId}:streak`;
    const playerCompletionsKey = `daily:${day}:user:${userId}:completions`;

    const [
      stats,
      playerStats,
      streak,
      lastCompletedDay,
      playerCompletions,
    ] = await Promise.all([
      redis.hGetAll(statsKey),
      redis.hGetAll(userStatsKey),
      redis.hGet(streakKey, 'count'),
      redis.hGet(streakKey, 'lastCompletedDay'),
      redis.get(playerCompletionsKey),
    ]);

    const totalCompletions = parseCount(stats.totalCompletions);
    const totalPuzzles = parseCount(playerStats.totalPuzzles);
    const bestCosts = [1, 2, 3]
      .map((id) => playerStats[`bestCost:${id}`])
      .filter((value): value is string => value !== undefined)
      .map((value) => parseCount(value));
    const bestTimes = [1, 2, 3]
      .map((id) => playerStats[`bestTime:${id}`])
      .filter((value): value is string => value !== undefined)
      .map((value) => parseCount(value));
    const gradeCounts = [
      { grade: 'S', count: parseCount(playerStats.sPlus) },
      { grade: 'A', count: parseCount(playerStats.a) },
      { grade: 'B', count: parseCount(playerStats.b) },
      { grade: 'C', count: parseCount(playerStats.c) },
    ];
    gradeCounts.sort((left, right) => right.count - left.count);
    const mostFrequentGrade = gradeCounts[0];

    return c.json({
      success: true,
      streak: activeStreak(streak, lastCompletedDay, day),
      globalAverageCost:
        totalCompletions > 0
          ? parseCount(stats.totalCost) / totalCompletions
          : null,
      totalCompletions,
      playerCompletions: parseCount(playerCompletions),
      playerStats: {
        streak: activeStreak(streak, lastCompletedDay, day),
        totalPuzzles,
        averageCost:
          totalPuzzles > 0
            ? parseCount(playerStats.totalCost) / totalPuzzles
            : null,
        personalBest: bestCosts.length > 0 ? Math.min(...bestCosts) : null,
        personalBests: [1, 2, 3].map((id) => ({
          levelId: id,
          cost:
            playerStats[`bestCost:${id}`] === undefined
              ? null
              : parseCount(playerStats[`bestCost:${id}`]),
        })),
        bestTimeSeconds: bestTimes.length > 0 ? Math.min(...bestTimes) : null,
        efficiencyRating:
          mostFrequentGrade && mostFrequentGrade.count > 0
            ? mostFrequentGrade.grade
            : '—',
      },
      gradeDistribution: {
        sPlus: parseCount(stats.sPlus),
        a: parseCount(stats.a),
        b: parseCount(stats.b),
        c: parseCount(stats.c),
      },
    });
  } catch (error: unknown) {
    console.error('Failed to load daily circuit state:', error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 500);
  }
});

api.get('/community-distribution', async (c) => {
  const levelId = parseLevelId(c.req.query('levelId'));
  if (levelId !== 1) {
    return c.json(
      { success: false, error: 'Community distribution is available for the daily puzzle only' },
      400
    );
  }

  try {
    const day = currentDay();
    const userId = getUserId();
    const [stats, result] = await Promise.all([
      redis.hGetAll(`${dailyLevelKey(day, levelId)}:stats`),
      redis.hGetAll(`daily:${day}:user:${userId}:result`),
    ]);

    return c.json({
      success: true,
      total: parseCount(stats.totalCompletions),
      gradeDistribution: {
        sPlus: parseCount(stats.sPlus),
        a: parseCount(stats.a),
        b: parseCount(stats.b),
        c: parseCount(stats.c),
      },
      playerGrade: isGrade(result.rank) ? result.rank : null,
    });
  } catch (error: unknown) {
    console.error('Failed to load community distribution:', error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 500);
  }
});

api.post('/share-result', async (c) => {
  try {
    const day = currentDay();
    const userId = getUserId();
    const resultKey = `daily:${day}:user:${userId}:result`;
    const result = await redis.hGetAll(resultKey);
    const cost = Number(result.cost);
    const grade = result.rank;

    if (!Number.isSafeInteger(cost) || cost < 0 || !isGrade(grade)) {
      return c.json(
        { success: false, error: 'Complete today’s daily puzzle before sharing' },
        404
      );
    }
    if (!context.postId) {
      return c.json(
        { success: false, error: 'No Reddit thread is available for sharing' },
        400
      );
    }
    if (result.shared === '1') {
      return c.json({ success: true, alreadyShared: true });
    }

    await reddit.submitComment({
      id: context.postId,
      text: `⚡ Daily Circuit — Rank ${grade} | Cost $${cost}`,
    });
    await redis.hSet(resultKey, { shared: '1' });
    await redis.expire(resultKey, DAILY_KEY_TTL_SECONDS);

    return c.json({ success: true, alreadyShared: false });
  } catch (error: unknown) {
    console.error('Failed to share daily circuit result:', error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 500);
  }
});

api.post('/submit-score', async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(
      { success: false, error: 'Request body must be valid JSON' },
      400
    );
  }

  const submission = parseScoreSubmission(payload);
  if (!submission) {
    return c.json(
      {
        success: false,
        error: 'Valid levelId, cost, parts, and durationSeconds are required',
      },
      400
    );
  }

  try {
    const { levelId, cost, hintsUsed, durationSeconds } = submission;
    const targetCost = submission.targetCost ?? TARGET_COST_BY_LEVEL[levelId];
    if (targetCost === undefined) {
      return c.json({ success: false, error: 'Unknown levelId' }, 400);
    }

    const day = currentDay();
    const userId = getUserId();
    const grade = gradeForCost(cost, targetCost);
    const gradeField = fieldForGrade(grade);
    const baseKey = dailyLevelKey(day, levelId);
    const leaderboardKey = `${baseKey}:leaderboard`;
    const statsKey = `${baseKey}:stats`;
    const timesKey = `${baseKey}:times`;
    const playerStatsKey = `user:${userId}:circuit:stats`;
    const member = `user:${userId}`;
    const [previousCost, previousDurationValue, previousBestCostValue, previousBestTimeValue] =
      await Promise.all([
        redis.zScore(leaderboardKey, member),
        redis.hGet(timesKey, userId),
        redis.hGet(playerStatsKey, `bestCost:${levelId}`),
        redis.hGet(playerStatsKey, `bestTime:${levelId}`),
      ]);

    const previousDuration =
      previousDurationValue === undefined
        ? undefined
        : parseCount(previousDurationValue);
    const previousBestCost =
      previousBestCostValue === undefined
        ? undefined
        : parseCount(previousBestCostValue);
    const previousBestTime =
      previousBestTimeValue === undefined
        ? undefined
        : parseCount(previousBestTimeValue);
    const isFirstCompletion = previousCost === undefined;
    const previousGrade =
      previousCost === undefined
        ? undefined
        : gradeForCost(previousCost, targetCost);

    const updates: Promise<unknown>[] = [
      redis.zAdd(leaderboardKey, { member, score: cost }),
      redis.zAdd(`leaderboard:level:${levelId}`, { member, score: cost }),
      redis.hIncrBy(statsKey, 'totalCost', cost - (previousCost ?? 0)),
      redis.hIncrBy(
        playerStatsKey,
        'totalCost',
        cost - (previousCost ?? 0)
      ),
      redis.hIncrBy(
        playerStatsKey,
        'totalTimeSeconds',
        durationSeconds - (previousDuration ?? 0)
      ),
    ];

    if (isFirstCompletion) {
      updates.push(
        redis.hIncrBy(statsKey, 'totalCompletions', 1),
        redis.hIncrBy(playerStatsKey, 'totalPuzzles', 1)
      );
    }
    if (previousGrade !== grade) {
      if (previousGrade) {
        updates.push(
          redis.hIncrBy(statsKey, fieldForGrade(previousGrade), -1),
          redis.hIncrBy(
            playerStatsKey,
            fieldForGrade(previousGrade),
            -1
          )
        );
      }
      updates.push(
        redis.hIncrBy(statsKey, gradeField, 1),
        redis.hIncrBy(playerStatsKey, gradeField, 1)
      );
    }
    if (previousBestCost === undefined || cost < previousBestCost) {
      updates.push(
        redis.hSet(playerStatsKey, {
          [`bestCost:${levelId}`]: String(cost),
        })
      );
    }
    if (previousBestTime === undefined || durationSeconds < previousBestTime) {
      updates.push(
        redis.hSet(playerStatsKey, {
          [`bestTime:${levelId}`]: String(durationSeconds),
        })
      );
    }

    await Promise.all(updates);
    await Promise.all([
      redis.expire(leaderboardKey, DAILY_KEY_TTL_SECONDS),
      redis.expire(statsKey, DAILY_KEY_TTL_SECONDS),
      redis.hSet(timesKey, { [userId]: String(durationSeconds) }),
      redis.expire(timesKey, DAILY_KEY_TTL_SECONDS),
      ...(isFirstCompletion
        ? [
            redis.incrBy(`daily:${day}:user:${userId}:completions`, 1),
            redis.expire(
              `daily:${day}:user:${userId}:completions`,
              DAILY_KEY_TTL_SECONDS
            ),
          ]
        : []),
    ]);
    if (levelId === 1) {
        const dailyResultKey = `daily:${day}:user:${userId}:result`;
        await redis.hSet(dailyResultKey, {
          cost: String(cost),
          rank: grade,
          hintsUsed: String(hintsUsed),
          time: String(durationSeconds),
          shared: '0',
        });
        await redis.expire(dailyResultKey, DAILY_KEY_TTL_SECONDS);
    }

    const streakKey = `user:${userId}:streak`;
    const [previousDay, currentStreakValue] = await Promise.all([
      redis.hGet(streakKey, 'lastCompletedDay'),
      redis.hGet(streakKey, 'count'),
    ]);
    let streak = parseCount(currentStreakValue);
    if (previousDay !== day) {
      streak = isStreakActive(previousDay, day) ? streak + 1 : 1;
      await redis.hSet(streakKey, {
        count: String(streak),
        lastCompletedDay: day,
      });
    }

    const integrationWarnings: string[] = [];
    if (grade === 'S' || grade === 'A') {
      try {
        const username = await reddit.getCurrentUsername();
        if (username) {
          await reddit.setUserFlair({
            subredditName: context.subredditName,
            username,
            text: `⚡ Day ${streak} | ${grade} Architect`,
            cssClass: 'circuit-flair',
          });
        } else {
          integrationWarnings.push('User flair was not set because no username is available.');
        }
      } catch (error: unknown) {
        console.error('Failed to set solver flair:', error);
        integrationWarnings.push('Score saved, but user flair could not be updated.');
      }
    }

    return c.json({ success: true, grade, streak, integrationWarnings });
  } catch (error: unknown) {
    console.error('Failed to submit daily circuit score:', error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: message }, 500);
  }
});
