import { generate } from '../src/client/generator.ts';
import { getCampaignLevels } from '../src/client/puzzles.ts';
import { evaluate } from '../src/client/rules.ts';

const campaignSize = (level) =>
  level <= 5 ? 5 : Math.min(10, 5 + Math.floor((level - 6) / 5));
const difficultySize = (difficulty) => Math.min(10, 5 + Math.floor((difficulty - 1) / 5));
const dailySeedStart = Math.floor(Date.now() / 86_400_000);
const campaignLevelsById = new Map(
  getCampaignLevels().map((level) => [level.id, level])
);
const levelsToValidate = [
  ...Array.from({ length: 50 }, (_, index) => {
    const level = index + 1;
    return {
      label: `campaign ${level}`,
      campaignId: level,
      seed: 0x44430000 + level,
      size: campaignSize(level),
      difficulty: level,
    };
  }),
  ...Array.from({ length: 30 }, (_, index) => {
    const seed = dailySeedStart + index;
    const difficulty = (seed % 30) + 1;
    return {
      label: `daily seed ${seed}`,
      seed,
      size: difficultySize(difficulty),
      difficulty,
    };
  }),
];

let failures = 0;
const startedAt = performance.now();

for (const level of levelsToValidate) {
  const generated = generate(level.seed, level.size, level.difficulty);
  if (!generated) {
    console.error(`FAIL ${level.label}: generator could not find a valid solution.`);
    failures += 1;
    continue;
  }

  const evaluation = evaluate(generated, generated.placements);
  const valid =
    evaluation.receivers.length > 0 &&
    evaluation.receivers.every((receiver) => receiver.met) &&
    !evaluation.hazardPowered &&
    evaluation.hardwareCost === generated.targetCost;
  const catalogLevel = level.campaignId
    ? campaignLevelsById.get(level.campaignId)
    : undefined;
  const isGeneratedExtension =
    level.campaignId !== undefined && level.campaignId >= 31;
  const matchesCatalog =
    !isGeneratedExtension ||
    (catalogLevel !== undefined &&
      catalogLevel.source === generated.source &&
      catalogLevel.targetCost === generated.targetCost &&
      JSON.stringify(catalogLevel.targets) === JSON.stringify(generated.targets) &&
      JSON.stringify(catalogLevel.boosters) === JSON.stringify(generated.boosters) &&
      JSON.stringify(catalogLevel.walls) === JSON.stringify(generated.walls) &&
      JSON.stringify(catalogLevel.hazards) === JSON.stringify(generated.hazards));
  if (!valid || !matchesCatalog) {
    console.error(`FAIL ${level.label}: generated solution did not validate.`);
    failures += 1;
    continue;
  }

  console.log(
    `PASS ${level.label}: size ${generated.size}, cost ${generated.targetCost}, ` +
      `${evaluation.receivers.length} receiver(s)`
  );
}

console.log(
  `Validated ${levelsToValidate.length - failures}/${levelsToValidate.length} levels ` +
    `in ${Math.round(performance.now() - startedAt)}ms.`
);

if (failures > 0) process.exitCode = 1;
