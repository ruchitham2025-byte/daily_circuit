import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate } from '../src/client/rules.ts';

const createPuzzle = (targets, hazards = []) => ({
  size: 3,
  source: 0,
  targets,
  boosters: [],
  walls: [],
  hazards,
});

const createPlacements = (center, destination) => [
  { type: 4, rotation: 0, fixed: 'source' },
  center,
  destination,
  ...Array.from({ length: 6 }, () => ({
    type: 0,
    rotation: 0,
    fixed: 'none',
  })),
];

test('receiver is met when its voltage exactly matches the requirement', () => {
  const puzzle = createPuzzle([{ index: 2, voltage: 3 }]);
  const placements = createPlacements(
    { type: 1, rotation: 1, fixed: 'none' },
    { type: 4, rotation: 0, fixed: 'target' }
  );

  const result = evaluate(puzzle, placements);
  const receiver = result.receivers.find((candidate) => candidate.index === 2);

  assert.equal(receiver?.voltage, 3);
  assert.equal(receiver?.met, true);
});

test('receiver is unmet when its voltage is short by one volt', () => {
  const puzzle = createPuzzle([{ index: 2, voltage: 4 }]);
  const placements = createPlacements(
    { type: 1, rotation: 1, fixed: 'none' },
    { type: 4, rotation: 0, fixed: 'target' }
  );

  const result = evaluate(puzzle, placements);
  const receiver = result.receivers.find((candidate) => candidate.index === 2);

  assert.equal(receiver?.voltage, 3);
  assert.equal(receiver?.met, false);
});

test('a connected hazard is powered and triggers overload', () => {
  const puzzle = createPuzzle([], [2]);
  const placements = createPlacements(
    { type: 1, rotation: 1, fixed: 'none' },
    { type: 4, rotation: 0, fixed: 'hazard' }
  );

  const result = evaluate(puzzle, placements);

  assert.equal(result.hazardPowered, true);
  assert.equal(result.voltages.get(2), 3);
});

test('hint cost is added to the hardware total', () => {
  const puzzle = createPuzzle([{ index: 2, voltage: 3 }]);
  const placements = createPlacements(
    { type: 1, rotation: 1, fixed: 'none' },
    { type: 4, rotation: 0, fixed: 'target' }
  );

  const result = evaluate(puzzle, placements, 5);

  assert.equal(result.hardwareCost, 10);
  assert.equal(result.totalCost, 15);
});
