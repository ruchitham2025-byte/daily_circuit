import { levels } from '../src/client/puzzles.ts';
import { evaluate } from '../src/client/rules.ts';
import { solve } from '../src/client/solver.ts';

const today = levels.find((level) => level.date === 'TODAY');
if (!today) {
  throw new Error('No puzzle is marked TODAY.');
}

console.log(`Daily Circuit solver — ${today.title}`);
const startedAt = performance.now();
const result = solve(today);
const elapsedMs = Math.round(performance.now() - startedAt);
if (!result) {
  console.log(`No valid solution found after ${elapsedMs}ms (search cap: 2000ms).`);
  process.exitCode = 1;
} else {
  const cost = evaluate(today, result).totalCost;
  console.log(`Cost: $${cost}`);
  console.log('Placed components:');
  for (const [index, placement] of result.entries()) {
    if (placement.fixed !== 'none' || placement.type === 0) continue;
    console.log(`  cell ${index}: type ${placement.type}, rotation ${placement.rotation}`);
  }
}
