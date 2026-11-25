import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluate } from '../src/client/rules.ts';
import { solve, solveDetailed } from '../src/client/solver.ts';

test('solver returns a valid minimum-cost straight route', () => {
  const puzzle = {
    size: 3,
    source: 0,
    targets: [{ index: 2, voltage: 3 }],
    boosters: [],
    walls: [],
    hazards: [],
  };

  const placements = solve(puzzle);

  assert.ok(placements);
  const result = evaluate(puzzle, placements);
  assert.equal(result.receivers.every((receiver) => receiver.met), true);
  assert.equal(result.hazardPowered, false);
  assert.equal(result.totalCost, 10);
});

test('solver proves the optimum for a corridor with no alternate route', () => {
  const puzzle = {
    size: 3,
    source: 0,
    targets: [{ index: 2, voltage: 3 }],
    boosters: [],
    walls: [3, 4, 5, 6, 7, 8],
    hazards: [],
  };

  const outcome = solveDetailed(puzzle);

  assert.equal(outcome.optimal, true);
  assert.equal(outcome.cost, 10);
  assert.ok(outcome.placements);
  assert.equal(evaluate(puzzle, outcome.placements).receivers.every((receiver) => receiver.met), true);
});

test('solver preserves existing placements while routing the remaining circuit', () => {
  const puzzle = {
    size: 3,
    source: 0,
    targets: [{ index: 2, voltage: 3 }],
    boosters: [],
    walls: [],
    hazards: [],
  };
  const placements = [
    { type: 4, rotation: 0, fixed: 'source' },
    { type: 1, rotation: 1, fixed: 'none' },
    { type: 4, rotation: 0, fixed: 'target' },
    ...Array.from({ length: 6 }, () => ({
      type: 0,
      rotation: 0,
      fixed: 'none',
    })),
  ];

  const solution = solve(puzzle, placements);

  assert.ok(solution);
  assert.deepEqual(solution[1], placements[1]);
  assert.equal(evaluate(puzzle, solution).receivers.every((receiver) => receiver.met), true);
});

test('solver can test a wrong tile as locked empty', () => {
  const puzzle = {
    size: 3,
    source: 0,
    targets: [{ index: 2, voltage: 3 }],
    boosters: [],
    walls: [],
    hazards: [],
  };
  const placements = [
    { type: 4, rotation: 0, fixed: 'source' },
    { type: 1, rotation: 0, fixed: 'none' },
    { type: 4, rotation: 0, fixed: 'target' },
    ...Array.from({ length: 6 }, () => ({
      type: 0,
      rotation: 0,
      fixed: 'none',
    })),
  ];

  const solution = solve(puzzle, placements, {
    lockedEmptyIndices: [1],
    timeLimitMs: 200,
  });

  assert.equal(solution, null);
});
