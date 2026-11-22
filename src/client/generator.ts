import { evaluate, type Placement, type Puzzle } from './rules.ts';
import { solve } from './solver.ts';

export type GeneratedLevel = Puzzle & {
  seed: number;
  difficulty: number;
  lesson: 'voltage-decay' | 'booster' | 'splitter' | 'hazard' | 'budget' | 'advanced';
  placements: Placement[];
  targetCost: number;
};

type Random = () => number;

const MAX_ATTEMPTS = 8;
const MIN_SIZE = 3;
const MAX_SIZE = 12;

const seededRandom = (seed: number): Random => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffled = <T,>(values: readonly T[], random: Random): T[] => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) continue;
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
};

const position = (size: number, row: number, column: number): number =>
  row * size + column;

const coordinate = (
  size: number,
  index: number
): { row: number; column: number } => ({
  row: Math.floor(index / size),
  column: index % size,
});

const adjacent = (size: number, index: number): number[] => {
  const { row, column } = coordinate(size, index);
  return [
    row > 0 ? position(size, row - 1, column) : -1,
    column + 1 < size ? position(size, row, column + 1) : -1,
    row + 1 < size ? position(size, row + 1, column) : -1,
    column > 0 ? position(size, row, column - 1) : -1,
  ].filter((nextIndex) => nextIndex >= 0);
};

const buildRoute = (
  size: number,
  source: number,
  target: number,
  blocked: ReadonlySet<number>,
  random: Random
): number[] | null => {
  const previous = new Map<number, number>();
  const visited = new Set<number>([source]);
  const queue = [source];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current === target) break;

    for (const next of shuffled(adjacent(size, current), random)) {
      if (visited.has(next) || blocked.has(next)) continue;
      visited.add(next);
      previous.set(next, current);
      queue.push(next);
    }
  }

  if (!visited.has(target)) return null;

  const route = [target];
  let current = target;
  while (current !== source) {
    const parent = previous.get(current);
    if (parent === undefined) return null;
    route.push(parent);
    current = parent;
  }
  route.reverse();
  return route;
};

const createLessonLayout = (
  seed: number,
  size: number,
  difficulty: number,
  random: Random
): GeneratedLevel | null => {
  const center = Math.floor(size / 2);
  const source = position(size, center, center);
  const lesson =
    difficulty === 1 ? 'voltage-decay'
      : difficulty === 2 ? 'booster'
        : difficulty === 3 ? 'splitter'
          : difficulty === 4 ? 'hazard'
            : difficulty === 5 ? 'budget'
              : 'advanced';
  const needsSplitter = lesson === 'splitter' || lesson === 'budget';

  if (needsSplitter) {
    const split = position(size, center - 1, center);
    const branchLength = Math.min(center, size - 1 - center);
    const leftTarget = position(size, center - 1, center - branchLength);
    const rightTarget = position(size, center - 1, center + branchLength);
    const leftBranch = branchLength > 1
      ? [position(size, center - 1, center - 1), leftTarget]
      : [leftTarget];
    const rightBranch = branchLength > 1
      ? [position(size, center - 1, center + 1), rightTarget]
      : [rightTarget];
    const routes = [[source, split, ...leftBranch], [split, ...rightBranch]];
    const targets = [leftTarget, rightTarget];
    return createSplitLesson(
      seed,
      size,
      difficulty,
      lesson,
      routes,
      targets,
      source,
      split,
      random
    );
  }

  const target = lesson === 'booster'
    ? position(
      size,
      random() >= 0.5 ? size - 1 : 0,
      random() >= 0.5 ? size - 1 : 0
    )
    : random() >= 0.5
      ? position(size, center, random() >= 0.5 ? size - 1 : 0)
      : position(size, random() >= 0.5 ? size - 1 : 0, center);
  const idealRoute = buildRoute(size, source, target, new Set(), random);
  if (!idealRoute || idealRoute.length < 2) return null;

  const reserved = new Set(idealRoute);
  const blocked = new Set<number>();
  const hazards = new Set<number>();
  const obstacleCandidates = shuffled(
    Array.from({ length: size * size }, (_, index) => index)
      .filter((index) =>
        !reserved.has(index) &&
        adjacent(size, index).every((neighbor) => !reserved.has(neighbor))
      ),
    random
  );
  const wallCount = difficulty < 6 ? Math.min(1, Math.floor(size / 6)) :
    Math.min(2 + Math.floor((difficulty - 6) / 8), Math.floor(size));
  const hazardCount = lesson === 'hazard' ? 1 :
    difficulty >= 6 ? Math.min(1 + Math.floor((difficulty - 6) / 12), 3) : 0;
  let obstacleIndex = 0;

  for (let count = 0; count < wallCount; count += 1) {
    const cell = obstacleCandidates[obstacleIndex];
    if (cell === undefined) break;
    obstacleIndex += 1;
    blocked.add(cell);
  }
  for (let count = 0; count < hazardCount; count += 1) {
    const cell = obstacleCandidates[obstacleIndex];
    if (cell === undefined) break;
    obstacleIndex += 1;
    hazards.add(cell);
  }

  const blockedCells = new Set([...blocked, ...hazards]);
  const route = buildRoute(size, source, target, blockedCells, random);
  if (!route) return null;

  const puzzle: Puzzle = {
    size,
    source,
    targets: [],
    boosters: [],
    walls: [...blocked],
    hazards: [...hazards],
  };
  const placements = createPlacements(puzzle);
  const routeInteriors = route.slice(1, -1);
  if (lesson === 'booster' && routeInteriors.length > 0) {
    const boosterOffset = Math.min(routeInteriors.length - 1, Math.floor(routeInteriors.length / 2));
    const booster = routeInteriors[boosterOffset];
    if (booster !== undefined) puzzle.boosters = [booster];
  } else if (difficulty >= 6) {
    puzzle.boosters = routeInteriors.filter((_, offset) => offset % 4 === 3);
  }

  const reservedByCircuit = new Set<number>(route);
  if ([...hazards].some((hazard) =>
    adjacent(size, hazard).some((neighbor) => reservedByCircuit.has(neighbor))
  )) {
    return null;
  }

  for (const index of puzzle.walls) {
    const placement = placements[index];
    if (placement) placements[index] = { ...placement, fixed: 'wall' };
  }
  for (const index of puzzle.hazards) {
    const placement = placements[index];
    if (placement) placements[index] = { ...placement, fixed: 'hazard' };
  }
  for (const index of puzzle.boosters) {
    const placement = placements[index];
    if (placement) placements[index] = { ...placement, fixed: 'booster', type: 4 };
  }

  for (let pathIndex = 1; pathIndex < route.length - 1; pathIndex += 1) {
    const index = route[pathIndex];
    const previous = route[pathIndex - 1];
    const next = route[pathIndex + 1];
    if (index === undefined || previous === undefined || next === undefined) return null;
    if (puzzle.boosters.includes(index)) continue;

    const requiredDirections = [
      directionBetween(size, index, previous),
      directionBetween(size, index, next),
    ];
    const options = shuffled(
      componentOptions(puzzle, placements, index)
        .filter((option) => requiredDirections.every((direction) => option.connections.includes(direction))),
      random
    );
    const option = options[0];
    if (!option) return null;
    placements[index] = option.placement;
  }

  puzzle.targets = [{ index: target, voltage: 1 }];
  const targetPlacement = placements[target];
  if (targetPlacement) placements[target] = { ...targetPlacement, fixed: 'target', type: 4 };
  const initialEvaluation = evaluate(puzzle, placements);
  if (initialEvaluation.hazardPowered) return null;
  const targetVoltage = initialEvaluation.voltages.get(target) ?? 0;
  if (targetVoltage < 1) return null;
  puzzle.targets = [{ index: target, voltage: targetVoltage }];

  const solution = solve(puzzle);
  if (!solution) return null;
  const solvedEvaluation = evaluate(puzzle, solution);
  if (
    solvedEvaluation.hazardPowered ||
    solvedEvaluation.receivers.some((receiver) => !receiver.met)
  ) {
    return null;
  }

  return {
    ...puzzle,
    seed,
    difficulty,
    lesson,
    placements: solution,
    targetCost: solvedEvaluation.hardwareCost,
  };
};

const createPlacements = (puzzle: Puzzle): Placement[] =>
  Array.from({ length: puzzle.size * puzzle.size }, (_, index) => {
    if (index === puzzle.source) return { type: 4, rotation: 0, fixed: 'source' };
    if (puzzle.targets.some((target) => target.index === index)) {
      return { type: 4, rotation: 0, fixed: 'target' };
    }
    if (puzzle.boosters.includes(index)) {
      return { type: 4, rotation: 0, fixed: 'booster' };
    }
    if (puzzle.walls.includes(index)) return { type: 0, rotation: 0, fixed: 'wall' };
    if (puzzle.hazards.includes(index)) return { type: 4, rotation: 0, fixed: 'hazard' };
    return { type: 0, rotation: 0, fixed: 'none' };
  });

type ComponentOption = {
  placement: Placement;
  connections: readonly number[];
};

const componentOptions = (
  puzzle: Puzzle,
  placements: Placement[],
  index: number
): ComponentOption[] =>
  [1, 2, 3].flatMap((type) =>
    Array.from({ length: 4 }, (_, rotation) => {
      const candidate = placements.slice();
      candidate[index] = { type, rotation, fixed: 'none' };
      return {
        placement: candidate[index] ?? { type, rotation, fixed: 'none' },
        connections: evaluate(puzzle, candidate).connections.get(index) ?? [],
      };
    })
  );

const directionBetween = (size: number, from: number, to: number): number => {
  const fromCoordinate = coordinate(size, from);
  const toCoordinate = coordinate(size, to);
  if (toCoordinate.row < fromCoordinate.row) return 0;
  if (toCoordinate.column > fromCoordinate.column) return 1;
  if (toCoordinate.row > fromCoordinate.row) return 2;
  return 3;
};

const createSplitLesson = (
  seed: number,
  size: number,
  difficulty: number,
  lesson: GeneratedLevel['lesson'],
  routes: number[][],
  targets: number[],
  source: number,
  forcedSplitter: number | null,
  random: Random
): GeneratedLevel | null => {
  const occupied = new Set(routes.flat());
  const wallCandidates = shuffled(
    Array.from({ length: size * size }, (_, index) => index)
      .filter((index) =>
        !occupied.has(index) &&
        adjacent(size, index).every((neighbor) => !occupied.has(neighbor))
      ),
    random
  );
  const wallCount = difficulty >= 5 ? Math.min(2, Math.floor(size / 3)) : 0;
  const walls = wallCandidates.slice(0, wallCount);
  const puzzle: Puzzle = {
    size,
    source,
    targets: [],
    boosters: [],
    walls,
    hazards: [],
  };
  const placements = createPlacements(puzzle);

  const neighbors = new Map<number, Set<number>>();
  for (const route of routes) {
    for (let offset = 1; offset < route.length; offset += 1) {
      const current = route[offset];
      const previous = route[offset - 1];
      if (current === undefined || previous === undefined) return null;
      const currentNeighbors = neighbors.get(current) ?? new Set<number>();
      const previousNeighbors = neighbors.get(previous) ?? new Set<number>();
      currentNeighbors.add(previous);
      previousNeighbors.add(current);
      neighbors.set(current, currentNeighbors);
      neighbors.set(previous, previousNeighbors);
    }
  }

  const targetSet = new Set(targets);
  for (const [index, adjacentCells] of neighbors) {
    if (index === source || targetSet.has(index)) continue;
    const requiredDirections = [...adjacentCells].map((neighbor) =>
      directionBetween(size, index, neighbor)
    );
    const options = shuffled(
      componentOptions(puzzle, placements, index)
        .filter((option) =>
          requiredDirections.every((direction) => option.connections.includes(direction))
        ),
      random
    );
    const selectedOption = index === forcedSplitter
      ? options.find((option) => option.placement.type === 3)
      : options[0];
    if (!selectedOption) return null;
    placements[index] = selectedOption.placement;
  }

  for (const wall of walls) {
    const placement = placements[wall];
    if (placement) placements[wall] = { ...placement, fixed: 'wall' };
  }
  puzzle.targets = targets.map((index) => ({ index, voltage: 1 }));
  for (const target of targets) {
    const placement = placements[target];
    if (placement) placements[target] = { ...placement, fixed: 'target', type: 4 };
  }

  const initialEvaluation = evaluate(puzzle, placements);
  if (initialEvaluation.hazardPowered) return null;
  const evaluatedTargets = targets.map((index) => ({
    index,
    voltage: initialEvaluation.voltages.get(index) ?? 0,
  }));
  if (evaluatedTargets.some((target) => target.voltage < 1)) return null;
  puzzle.targets = evaluatedTargets;

  const solution = solve(puzzle);
  if (!solution) return null;
  const solvedEvaluation = evaluate(puzzle, solution);
  if (
    solvedEvaluation.hazardPowered ||
    solvedEvaluation.receivers.some((receiver) => !receiver.met)
  ) {
    return null;
  }

  return {
    ...puzzle,
    seed,
    difficulty,
    lesson,
    placements: solution,
    targetCost: solvedEvaluation.hardwareCost,
  };
};

export const generate = (
  seed: number,
  size: number,
  difficulty: number
): GeneratedLevel | null => {
  if (!Number.isInteger(seed)) throw new Error('Seed must be an integer.');
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new Error(`Size must be an integer from ${MIN_SIZE} to ${MAX_SIZE}.`);
  }
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 30) {
    throw new Error('Difficulty must be an integer from 1 to 30.');
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const random = seededRandom(seed + attempt * 0x9e3779b9);
    const level = createLessonLayout(seed, size, difficulty, random);
    if (level) return level;
  }
  return null;
};
