import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMPAIGN_LEVEL_COUNT,
  DAILY_LEVEL_ID,
  getCampaignLevels,
  getDailyLevel,
} from '../src/client/puzzles.ts';

test('campaign catalog contains 30 solvable, progressively sized sectors', () => {
  const levels = getCampaignLevels();

  assert.equal(levels.length, CAMPAIGN_LEVEL_COUNT);
  assert.deepEqual(
    levels.map((level) => level.id),
    Array.from({ length: CAMPAIGN_LEVEL_COUNT }, (_, index) => index + 1)
  );

  for (const level of levels) {
    assert.ok(level.size >= 5 && level.size <= 10);
    assert.ok(level.targetCost > 0);
    assert.equal(level.mode, 'campaign');
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
