import { writeFileSync } from 'node:fs';
import { evaluate } from '../src/client/rules.ts';
import { solveDetailed } from '../src/client/solver.ts';

const catalogPath = new URL('../src/client/sectors.json', import.meta.url);
const titles = [
  'Corner Office',
  'The Long Way Round',
  'Branch Manager',
  'Booster Seat',
  'Split Decision',
  'No Short Circuit',
  'Hazard Pay',
  'The Shared Trunk',
  'Current Affairs',
  'One More Turn',
];

const asIndex = (size, [row, column]) => row * size + column;

const transform = (size, [row, column], turns, mirrored) => {
  let transformedRow = row;
  let transformedColumn = mirrored ? size - 1 - column : column;
  for (let turn = 0; turn < turns; turn += 1) {
    [transformedRow, transformedColumn] = [
      transformedColumn,
      size - 1 - transformedRow,
    ];
  }
  return [transformedRow, transformedColumn];
};

const getTemplate = (size, extended = false) => {
  if (size === 6) {
    return {
      source: [1, 0],
      targets: [[3, 4], extended ? [5, 3] : [4, 2]],
      boosters: [[1, 1], [2, 4], ...(extended ? [[4, 2]] : [])],
      splitters: [[1, 2]],
      paths: [
        [[1, 0], [1, 1], [1, 2]],
        [[1, 2], [1, 3], [1, 4], [2, 4], [3, 4]],
        extended
          ? [[1, 2], [2, 2], [3, 2], [4, 2], [4, 3], [5, 3]]
          : [[1, 2], [2, 2], [3, 2], [4, 2]],
      ],
    };
  }

  const secondJunctionRow = 3;
  const targetAColumn = size - 2;
  const targetBColumn = size - 2;
  const targetCRow = size - 1;
  return {
    source: [0, 0],
    targets: [
      [0, targetAColumn],
      [secondJunctionRow, targetBColumn],
      [targetCRow, 2],
    ],
    boosters: [
      [0, 1],
      [2, 2],
      ...(size >= 8 ? [[0, 4]] : []),
      ...(size >= 8 ? [[3, 4]] : []),
      ...(size === 8 ? [[5, 2]] : []),
      ...(size === 9 ? [[6, 2]] : []),
    ],
    splitters: [
      [0, 2],
      [secondJunctionRow, 2],
    ],
    paths: [
      [[0, 0], [0, 1], [0, 2]],
      [
        [0, 2],
        ...Array.from({ length: targetAColumn - 3 }, (_, index) => [0, index + 3]),
        [0, targetAColumn],
      ],
      [[0, 2], [1, 2], [2, 2], [secondJunctionRow, 2]],
      [
        [secondJunctionRow, 2],
        ...Array.from({ length: targetBColumn - 3 }, (_, index) => [
          secondJunctionRow,
          index + 3,
        ]),
        [secondJunctionRow, targetBColumn],
      ],
      [
        [secondJunctionRow, 2],
        ...Array.from({ length: targetCRow - secondJunctionRow - 1 }, (_, index) => [
          secondJunctionRow + index + 1,
          2,
        ]),
        [targetCRow, 2],
      ],
    ],
  };
};

const makeLevel = (id) => {
  const chapter = Math.ceil(id / 10);
  const size =
    chapter === 1
      ? 6
      : chapter === 2
        ? id % 2 === 0
          ? 7
          : 6
        : chapter === 3
          ? 7
          : chapter === 4
            ? id % 2 === 0
              ? 8
              : 7
            : id % 2 === 0
              ? 9
              : 8;
  const template = getTemplate(size, chapter === 2);
  const turns = (id - 1) % 4;
  const mirrored = Math.floor((id - 1) / 4) % 2 === 1;
  const point = (coordinate) => transform(size, coordinate, turns, mirrored);
  const index = (coordinate) => asIndex(size, point(coordinate));
  const source = index(template.source);
  const targets = template.targets.map(index);
  const boosters = template.boosters.map(index);
  const splitters = new Set(template.splitters.map(index));
  const routes = new Set(template.paths.flatMap((path) => path.map(index)));
  if (
    routes.size !== template.paths.reduce((count, path) => count + path.length - 1, 1) ||
    !routes.has(source) ||
    targets.some((target) => !routes.has(target))
  ) {
    throw new Error(`Sector ${id}: the corridor template overlaps or omits a route endpoint.`);
  }

  const adjacentRoute = (cell) => {
    const row = Math.floor(cell / size);
    const column = cell % size;
    return [
      [row - 1, column],
      [row + 1, column],
      [row, column - 1],
      [row, column + 1],
    ].some(
      ([nextRow, nextColumn]) =>
        nextRow >= 0 &&
        nextRow < size &&
        nextColumn >= 0 &&
        nextColumn < size &&
        routes.has(nextRow * size + nextColumn)
    );
  };
  const hazardCandidates = Array.from({ length: size * size }, (_, cell) => cell).filter(
    (cell) => !routes.has(cell) && !adjacentRoute(cell)
  );
  const hazardCount = chapter;
  if (hazardCandidates.length < hazardCount) {
    throw new Error(`Sector ${id}: not enough safe hazard locations.`);
  }
  const hazards = Array.from({ length: hazardCount }, (_, offset) => {
    const candidateIndex = (id * 11 + offset) % hazardCandidates.length;
    return hazardCandidates[candidateIndex];
  });
  if (new Set(hazards).size !== hazards.length) {
    throw new Error(`Sector ${id}: duplicate hazard locations.`);
  }

  const allRouteCells = new Set([...routes, ...boosters]);
  const walls = Array.from({ length: size * size }, (_, cell) => cell).filter(
    (cell) => !allRouteCells.has(cell) && !hazards.includes(cell)
  );
  const puzzle = {
    size,
    source,
    targets: targets.map((target) => ({ index: target, voltage: 1 })),
    boosters,
    walls,
    hazards,
  };
  const placements = Array.from({ length: size * size }, (_, cell) => {
    if (cell === source) return { type: 4, rotation: 0, fixed: 'source' };
    if (targets.includes(cell)) return { type: 4, rotation: 0, fixed: 'target' };
    if (boosters.includes(cell)) return { type: 4, rotation: 0, fixed: 'booster' };
    if (hazards.includes(cell)) return { type: 4, rotation: 0, fixed: 'hazard' };
    if (walls.includes(cell)) return { type: 0, rotation: 0, fixed: 'wall' };
    if (splitters.has(cell)) return { type: 3, rotation: 0, fixed: 'none' };
    return { type: 1, rotation: 0, fixed: 'none' };
  });
  const firstSolution = solveDetailed(puzzle, undefined, { timeLimitMs: 10000 });
  if (!firstSolution.placements || !firstSolution.optimal) {
    throw new Error(
      `Sector ${id}: solver could not find a safe route: ${JSON.stringify({
        puzzle,
        routes: [...routes],
        outcome: firstSolution,
      })}`
    );
  }
  const firstEvaluation = evaluate(puzzle, firstSolution.placements);
  puzzle.targets = firstEvaluation.receivers.map((receiver) => ({
    index: receiver.index,
    voltage: Math.max(1, Math.min(4, receiver.voltage)),
  }));
  const solution = solveDetailed(puzzle, undefined, { timeLimitMs: 10000 });
  if (!solution.placements || !solution.optimal) {
    throw new Error(`Sector ${id}: solver could not prove an optimal solution.`);
  }
  const verification = evaluate(puzzle, solution.placements);
  if (
    verification.receivers.some((receiver) => !receiver.met) ||
    verification.hazardPowered ||
    verification.hardwareCost !== solution.cost
  ) {
    throw new Error(`Sector ${id}: solver result did not pass the safety/cost checks.`);
  }

  const chapterTitles = [
    'FIRST CURRENT',
    'VOLTAGE LAB',
    'LIVE WIRES',
    'DEEP CIRCUIT',
    'GRID ARCHITECT',
  ];
  return {
    id,
    mode: 'campaign',
    title: `${chapterTitles[chapter - 1]} · ${titles[(id - 1) % titles.length]}`,
    date: `SECTOR ${String(id).padStart(2, '0')}`,
    targetCost: solution.cost,
    difficulty: `TIER ${chapter}`,
    size,
    source,
    targets: puzzle.targets,
    boosters,
    walls,
    hazards,
  };
};

const generatedCatalog = Array.from({ length: 50 }, (_, index) => makeLevel(index + 1));
writeFileSync(catalogPath, `${JSON.stringify(generatedCatalog, null, 2)}\n`);
console.log(`Generated and solver-verified ${generatedCatalog.length} campaign sectors.`);
