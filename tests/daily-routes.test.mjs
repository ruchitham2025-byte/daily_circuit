import assert from 'node:assert/strict';
import test from 'node:test';
import { dailyLayout } from '../src/client/puzzles.ts';
import { evaluate } from '../src/client/rules.ts';

test('366 consecutive daily benches have a safe, on-budget route to both receivers', () => {
  for (let day = 0; day < 366; day++) {
    const { level, solution } = dailyLayout(new Date(Date.UTC(2026, 0, day + 1)));
    const grid = Array.from({length: level.size ** 2}, (_, index) => ({
      type: 0, rotation: 0, fixed: 'none', ...solution.get(index),
    }));
    const result = evaluate(level, grid);
    assert.ok(solution.size >= 7, level.date);
    assert.equal(result.receivers.length, 2);
    assert.ok(result.receivers.every(receiver => receiver.met), level.date);
    assert.equal(result.hazardPowered, false, level.date);
    assert.equal(result.totalCost, level.targetCost, level.date);
  }
});
