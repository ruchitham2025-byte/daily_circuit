import { getCampaignLevels, dailyLayout } from '../src/client/puzzles.ts';
import { evaluate } from '../src/client/rules.ts';
import { solve, solveDetailed } from '../src/client/solver.ts';

let failures = 0;
let campaignFailures = 0;
const startedAt = performance.now();

for (const level of getCampaignLevels()) {
  const outcome = solveDetailed(level, undefined, { timeLimitMs: 10000 });
  const solution = outcome.placements;
  if (!solution || !outcome.optimal) {
    console.error(`FAIL sector ${level.id}: solver did not prove an optimal safe route.`);
    failures += 1;
    campaignFailures += 1;
    continue;
  }

  const result = evaluate(level, solution);
  const valid =
    result.receivers.length > 0 &&
    result.receivers.every((receiver) => receiver.met) &&
    !result.hazardPowered &&
    result.hardwareCost === level.targetCost;
  if (!valid) {
    console.error(`FAIL sector ${level.id}: target cost or route did not verify.`);
    failures += 1;
    campaignFailures += 1;
    continue;
  }

  console.log(
    `PASS sector ${String(level.id).padStart(2, '0')}: $${result.hardwareCost}, ` +
      `${result.receivers.length} receiver(s), no overload`
  );
}

const { level: daily, solution: dailyParts } = dailyLayout();
const dailyPlacements = Array.from({ length: daily.size ** 2 }, (_, index) => ({
  type: 0,
  rotation: 0,
  fixed:
    index === daily.source
      ? 'source'
      : daily.targets.some((target) => target.index === index)
        ? 'target'
        : daily.boosters.includes(index)
          ? 'booster'
          : daily.walls.includes(index)
            ? 'wall'
            : daily.hazards.includes(index)
              ? 'hazard'
              : 'none',
}));
for (const [index, part] of dailyParts) {
  const placement = dailyPlacements[index];
  if (placement) dailyPlacements[index] = { ...part, fixed: 'none' };
}
const dailySolution = solve(daily, dailyPlacements);
if (!dailySolution) {
  console.error('FAIL daily challenge: solver did not validate the route.');
  failures += 1;
} else {
  const result = evaluate(daily, dailySolution);
  if (
    result.hazardPowered ||
    result.receivers.some((receiver) => !receiver.met) ||
    result.hardwareCost !== daily.targetCost
  ) {
    console.error('FAIL daily challenge: target cost or route did not verify.');
    failures += 1;
  } else {
    console.log(`PASS daily challenge: $${result.hardwareCost}, no overload`);
  }
}

console.log(
  `Verified ${50 - campaignFailures}/${50} campaign sectors and the daily puzzle in ` +
    `${Math.round(performance.now() - startedAt)}ms.`
);

if (failures > 0) process.exitCode = 1;
