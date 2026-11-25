import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMPAIGN_LEVEL_COUNT,
  DAILY_LEVEL_ID,
  getCampaignLevels,
  getDailyLevel,
  getLevelById,
} from '../src/client/puzzles.ts';

test('campaign catalog contains 50 ordered, structurally valid sectors', () => {
  const levels = getCampaignLevels();

  assert.equal(levels.length, CAMPAIGN_LEVEL_COUNT);
  assert.deepEqual(
    levels.map((level) => level.id),
    Array.from({ length: CAMPAIGN_LEVEL_COUNT }, (_, index) => index + 1)
  );

  const expectedSizes = {
    1: [6],
    2: [6, 7],
    3: [7],
    4: [7, 8],
    5: [8, 9],
  };
  const costBands = {
    1: [45, 85],
    2: [75, 130],
    3: [75, 130],
    4: [75, 150],
    5: [100, 200],
  };
  for (const level of levels) {
    const chapter = Math.ceil(level.id / 10);
    const [minimumCost, maximumCost] = costBands[chapter];

    assert.ok(expectedSizes[chapter].includes(level.size));
    assert.ok(
      level.targetCost >= minimumCost && level.targetCost <= maximumCost,
      `sector ${level.id} has out-of-band target cost $${level.targetCost}`
    );
    assert.ok(level.targetCost > 30);
    assert.equal(level.mode, 'campaign');
    assert.ok(level.targets.length >= 2);
    assert.ok(level.boosters.length > 0);
    assert.ok(level.hazards.length >= chapter);
    assert.ok(level.walls.length > 0);
  }

  assert.equal(DAILY_LEVEL_ID, 51);
  assert.equal(getLevelById(30)?.mode, 'campaign');
  assert.equal(getLevelById(31)?.mode, 'campaign');
  assert.equal(getLevelById(DAILY_LEVEL_ID)?.mode, 'daily');

  for (const level of levels) {
    const cellCount = level.size * level.size;
    assert.ok(level.source >= 0 && level.source < cellCount);
    assert.ok(level.targets.length > 0);
    assert.ok(level.targets.every((target) => target.index >= 0 && target.index < cellCount));
    assert.ok(level.boosters.every((index) => index >= 0 && index < cellCount));
    assert.ok(level.walls.every((index) => index >= 0 && index < cellCount));
    assert.ok(level.hazards.every((index) => index >= 0 && index < cellCount));
  }
});

test('daily puzzle is identical for instants on the same UTC date', () => {
  const beforeMidnightInLosAngeles = getDailyLevel(
    new Date('2026-03-08T23:59:59-08:00')
  );
  const sameUtcDate = getDailyLevel(new Date('2026-03-09T20:00:00Z'));
  const nextUtcDate = getDailyLevel(new Date('2026-03-10T00:00:00Z'));

  assert.equal(beforeMidnightInLosAngeles.id, DAILY_LEVEL_ID);
  assert.equal(beforeMidnightInLosAngeles.date, '2026-03-09');
  assert.deepEqual(beforeMidnightInLosAngeles, sameUtcDate);
  assert.equal(nextUtcDate.date, '2026-03-10');
  assert.notDeepEqual(nextUtcDate, sameUtcDate);
});
