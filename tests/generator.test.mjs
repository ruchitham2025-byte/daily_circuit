import assert from 'node:assert/strict';
import test from 'node:test';
import { generate } from '../src/client/generator.ts';
import { evaluate } from '../src/client/rules.ts';

test('generator is deterministic for the same seed and difficulty', () => {
  const first = generate(1234, 5, 1);
  const second = generate(1234, 5, 1);

  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(first, second);
});

test('splitter lessons can be generated on the minimum supported grid', () => {
  const generated = generate(123, 3, 3);

  assert.ok(generated);
  assert.equal(generated.targets.length, 2);
  assert.equal(generated.placements.some((placement) => placement.type === 3), true);
});

test('the first five campaign levels include their intended lessons', () => {
  const decay = generate(1, 5, 1);
  const booster = generate(2, 5, 2);
  const splitter = generate(3, 5, 3);
  const hazard = generate(4, 5, 4);
  const budget = generate(5, 5, 5);

  assert.ok(decay);
  assert.ok(booster);
  assert.ok(splitter);
  assert.ok(hazard);
  assert.ok(budget);
  assert.equal(decay.lesson, 'voltage-decay');
  assert.equal(booster.lesson, 'booster');
  assert.equal(booster.boosters.length > 0, true);
  assert.equal(booster.targetCost > 0, true);
  assert.equal(splitter.lesson, 'splitter');
  assert.equal(splitter.targets.length, 2);
  assert.equal(splitter.placements.some((placement) => placement.type === 3), true);
  assert.equal(hazard.lesson, 'hazard');
  assert.equal(hazard.hazards.length > 0, true);
  assert.equal(budget.lesson, 'budget');

  for (const generated of [decay, booster, splitter, hazard, budget]) {
    const result = evaluate(generated, generated.placements);
    assert.equal(result.receivers.every((receiver) => receiver.met), true);
    assert.equal(result.hazardPowered, false);
    assert.equal(result.hardwareCost, generated.targetCost);
  }
});
