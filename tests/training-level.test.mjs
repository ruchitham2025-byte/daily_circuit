import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate } from '../src/client/rules.ts';

test('the interactive training route demonstrates decay, booster, hazard, and target cost', () => {
  const puzzle = {
    size: 7,
    source: 21,
    targets: [{ index: 20, voltage: 1 }],
    boosters: [10],
    walls: [],
    hazards: [24],
  };
  const placements = Array.from({ length: 49 }, (_, index) => {
    if (index === puzzle.source) return { type: 4, rotation: 0, fixed: 'source' };
    if (puzzle.targets.some((target) => target.index === index)) {
      return { type: 4, rotation: 0, fixed: 'target' };
    }
    if (puzzle.boosters.includes(index)) {
      return { type: 4, rotation: 0, fixed: 'booster' };
    }
    if (puzzle.hazards.includes(index)) {
      return { type: 4, rotation: 0, fixed: 'hazard' };
    }
    return { type: 0, rotation: 0, fixed: 'none' };
  });

  const routeParts = [
    { index: 22, type: 2, rotation: 3 },
    { index: 15, type: 1, rotation: 0 },
    { index: 8, type: 2, rotation: 1 },
    { index: 9, type: 1, rotation: 1 },
    { index: 11, type: 1, rotation: 1 },
    { index: 12, type: 1, rotation: 1 },
    { index: 13, type: 2, rotation: 2 },
  ];
  for (const part of routeParts) {
    placements[part.index] = { ...part, fixed: 'none' };
  }

  const result = evaluate(puzzle, placements);

  assert.equal(result.receivers.every((receiver) => receiver.met), true);
  assert.equal(result.receivers[0]?.requiredVoltage, 1);
  assert.equal(result.hazardPowered, false);
  assert.equal(result.hardwareCost, 85);
  assert.equal(result.voltages.get(10), 5);
});
