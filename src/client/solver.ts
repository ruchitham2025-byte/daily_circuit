import {
  DIRECTIONS,
  evaluate,
  BOOSTER_VOLTAGE,
  type Placement,
  type Puzzle,
  type PuzzleEvaluation,
} from './rules.ts';

type SolverResult = {
  placements: Placement[];
  cost: number;
};

type SearchContext = {
  deadline: number;
  best: SolverResult | null;
  stopped: boolean;
};

const SEARCH_TIME_LIMIT_MS = 2000;

export type SolverOptions = {
  timeLimitMs?: number;
  lockedEmptyIndices?: readonly number[];
};

export type SolverOutcome = {
  placements: Placement[] | null;
  cost: number | null;
  optimal: boolean;
};

const COMPONENT_OPTIONS = [1, 2, 3]
  .flatMap((type) =>
    Array.from({ length: 4 }, (_, rotation) => ({ type, rotation }))
  )
  .map(({ type, rotation }) => {
    const probePuzzle: Puzzle = {
      size: 2,
      source: 0,
      targets: [],
      boosters: [],
      walls: [],
      hazards: [],
    };
    const probePlacements: Placement[] = [
      { type: 4, rotation: 0, fixed: 'source' },
      { type, rotation, fixed: 'none' },
      { type: 0, rotation: 0, fixed: 'none' },
      { type: 0, rotation: 0, fixed: 'none' },
    ];
    const probe = evaluate(probePuzzle, probePlacements);
    return {
      type,
      rotation,
      arms: probe.connections.get(1) ?? [],
      cost: probe.hardwareCost,
    };
  })
  .sort((left, right) => left.cost - right.cost);

const solveForcedTree = (puzzle: Puzzle): SolverOutcome | null => {
  const cellCount = puzzle.size * puzzle.size;
  const blocked = new Set([...puzzle.walls, ...puzzle.hazards]);
  const openIndices = Array.from({ length: cellCount }, (_, index) => index).filter(
    (index) => !blocked.has(index)
  );
  const open = new Set(openIndices);
  if (!open.has(puzzle.source)) return null;

  const neighbors = new Map<number, number[]>();
  let edgeCount = 0;
  for (const index of openIndices) {
    const row = Math.floor(index / puzzle.size);
    const column = index % puzzle.size;
    const adjacentIndices = DIRECTIONS.flatMap((direction) => {
      const nextRow = row + direction.row;
      const nextColumn = column + direction.column;
      if (
        nextRow < 0 ||
        nextRow >= puzzle.size ||
        nextColumn < 0 ||
        nextColumn >= puzzle.size
      ) {
        return [];
      }
      const nextIndex = nextRow * puzzle.size + nextColumn;
      return open.has(nextIndex) ? [nextIndex] : [];
    });
    neighbors.set(index, adjacentIndices);
    edgeCount += adjacentIndices.length;
  }
  edgeCount /= 2;
  if (edgeCount !== openIndices.length - 1) return null;

  const parents = new Map<number, number | null>([[puzzle.source, null]]);
  const queue = [puzzle.source];
  for (let offset = 0; offset < queue.length; offset += 1) {
    const current = queue[offset];
    if (current === undefined) continue;
    for (const next of neighbors.get(current) ?? []) {
      if (parents.has(next)) continue;
      parents.set(next, current);
      queue.push(next);
    }
  }
  if (parents.size !== openIndices.length) return null;

  const requiredNodes = new Set<number>([puzzle.source]);
  const requiredEdges = new Set<string>();
  for (const target of puzzle.targets) {
    if (!open.has(target.index)) return null;
    let current = target.index;
    requiredNodes.add(current);
    while (current !== puzzle.source) {
      const parent = parents.get(current);
      if (parent === undefined || parent === null) return null;
      requiredEdges.add(`${Math.min(current, parent)}:${Math.max(current, parent)}`);
      current = parent;
      requiredNodes.add(current);
    }
  }
  if (requiredNodes.size !== openIndices.length || requiredEdges.size !== edgeCount) {
    return null;
  }

  const placements = createInitialPlacements(puzzle);
  for (const index of openIndices) {
    if (
      index === puzzle.source ||
      puzzle.targets.some((target) => target.index === index) ||
      puzzle.boosters.includes(index)
    ) {
      continue;
    }

    const row = Math.floor(index / puzzle.size);
    const column = index % puzzle.size;
    const arms = DIRECTIONS.flatMap((direction) => {
      const nextRow = row + direction.row;
      const nextColumn = column + direction.column;
      if (nextRow < 0 || nextRow >= puzzle.size || nextColumn < 0 || nextColumn >= puzzle.size) {
        return [];
      }
      const nextIndex = nextRow * puzzle.size + nextColumn;
      return open.has(nextIndex) ? [direction.direction] : [];
    });
    const component = COMPONENT_OPTIONS.find(
      (option) =>
        option.arms.length === arms.length &&
        option.arms.every((arm) => arms.includes(arm))
    );
    if (!component) return null;
    placements[index] = {
      type: component.type,
      rotation: component.rotation,
      fixed: 'none',
    };
  }

  const evaluation = evaluate(puzzle, placements);
  if (
    evaluation.receivers.some((receiver) => !receiver.met) ||
    evaluation.hazardPowered
  ) {
    return null;
  }
  return {
    placements,
    cost: evaluation.hardwareCost,
    optimal: true,
  };
};

const createInitialPlacements = (
  puzzle: Puzzle,
  existingPlacements?: readonly Placement[]
): Placement[] =>
  Array.from({ length: puzzle.size * puzzle.size }, (_, index) => {
    const existing = existingPlacements?.[index];
    if (existing && existing.fixed === 'none' && existing.type > 0) {
      return { ...existing };
    }
    if (index === puzzle.source) return { type: 4, rotation: 0, fixed: 'source' };
    if (puzzle.targets.some((target) => target.index === index)) {
      return { type: 4, rotation: 0, fixed: 'target' };
    }
    if (puzzle.boosters.includes(index)) {
      return { type: 4, rotation: 0, fixed: 'booster' };
    }
    if (puzzle.walls.includes(index)) {
      return { type: 0, rotation: 0, fixed: 'wall' };
    }
    if (puzzle.hazards.includes(index)) {
      return { type: 4, rotation: 0, fixed: 'hazard' };
    }
    return { type: 0, rotation: 0, fixed: 'none' };
  });

const isBlocked = (
  puzzle: Puzzle,
  index: number,
  lockedEmptyIndices: ReadonlySet<number>
): boolean =>
  puzzle.walls.includes(index) ||
  puzzle.hazards.includes(index) ||
  lockedEmptyIndices.has(index);

const distance = (puzzle: Puzzle, left: number, right: number): number =>
  Math.abs(Math.floor(left / puzzle.size) - Math.floor(right / puzzle.size)) +
  Math.abs((left % puzzle.size) - (right % puzzle.size));

const canReachReceiver = (
  puzzle: Puzzle,
  evaluation: PuzzleEvaluation,
  receiverIndex: number,
  requiredVoltage: number
): boolean => {
  let bestRemainingVoltage = -1;
  for (const [index, voltage] of evaluation.voltages) {
    const optimisticVoltage = voltage - distance(puzzle, index, receiverIndex);
    bestRemainingVoltage = Math.max(bestRemainingVoltage, optimisticVoltage);
  }

  for (const boosterIndex of puzzle.boosters) {
    const optimisticVoltage =
      BOOSTER_VOLTAGE - distance(puzzle, boosterIndex, receiverIndex);
    bestRemainingVoltage = Math.max(bestRemainingVoltage, optimisticVoltage);
  }

  return bestRemainingVoltage >= requiredVoltage;
};

const canReachAllReceivers = (
  puzzle: Puzzle,
  evaluation: PuzzleEvaluation
): boolean =>
  evaluation.receivers
    .filter((receiver) => !receiver.met)
    .every((receiver) =>
      canReachReceiver(
        puzzle,
        evaluation,
        receiver.index,
        receiver.requiredVoltage
      )
    );

const isEvaluationValid = (
  evaluation: PuzzleEvaluation,
  protectedReceiverIndices: readonly number[]
): boolean =>
  !evaluation.hazardPowered &&
  protectedReceiverIndices.every((index) =>
    evaluation.receivers.some((receiver) => receiver.index === index && receiver.met)
  );

export const solveDetailed = (
  puzzle: Puzzle,
  existingPlacements?: readonly Placement[],
  options: SolverOptions = {}
): SolverOutcome => {
  const lockedEmptyIndices = new Set(options.lockedEmptyIndices ?? []);
  if (!existingPlacements && lockedEmptyIndices.size === 0) {
    const forcedTree = solveForcedTree(puzzle);
    if (forcedTree) return forcedTree;
  }

  const timeLimitMs = options.timeLimitMs ?? SEARCH_TIME_LIMIT_MS;
  const context: SearchContext = {
    deadline: Date.now() + timeLimitMs,
    best: null,
    stopped: false,
  };
  const initialPlacements = createInitialPlacements(puzzle, existingPlacements);

  const connectRemainingReceivers = (placements: Placement[]): void => {
    if (context.stopped) return;
    if (Date.now() >= context.deadline) {
      context.stopped = true;
      return;
    }

    const evaluation = evaluate(puzzle, placements);
    if (evaluation.hazardPowered) return;
    if (context.best && evaluation.hardwareCost >= context.best.cost) return;
    if (!canReachAllReceivers(puzzle, evaluation)) return;

    const remainingReceivers = evaluation.receivers
      .filter((receiver) => !receiver.met)
      .sort((left, right) => distance(puzzle, puzzle.source, left.index) - distance(puzzle, puzzle.source, right.index));

    if (remainingReceivers.length === 0) {
      context.best = {
        placements: placements.map((placement) => ({ ...placement })),
        cost: evaluation.hardwareCost,
      };
      return;
    }

    const target = remainingReceivers[0];
    if (!target) return;
    const protectedReceiverIndices = evaluation.receivers
      .filter((receiver) => receiver.met)
      .map((receiver) => receiver.index);
    routeToReceiver(
      puzzle.source,
      null,
      target.index,
      target.requiredVoltage,
      placements,
      new Set([puzzle.source]),
      protectedReceiverIndices
    );
  };

  const routeToReceiver = (
    currentIndex: number,
    incomingArm: number | null,
    targetIndex: number,
    targetVoltage: number,
    placements: Placement[],
    path: Set<number>,
    protectedReceiverIndices: readonly number[]
  ): void => {
    if (context.stopped || Date.now() >= context.deadline) {
      context.stopped = true;
      return;
    }
    if (context.best && evaluate(puzzle, placements).hardwareCost >= context.best.cost) {
      return;
    }

    const currentRow = Math.floor(currentIndex / puzzle.size);
    const currentColumn = currentIndex % puzzle.size;
    const orderedDirections = [...DIRECTIONS].sort((left, right) => {
      const leftIndex = (currentRow + left.row) * puzzle.size + currentColumn + left.column;
      const rightIndex = (currentRow + right.row) * puzzle.size + currentColumn + right.column;
      return distance(puzzle, leftIndex, targetIndex) -
        distance(puzzle, rightIndex, targetIndex);
    });

    for (const direction of orderedDirections) {
      if (context.stopped) return;
      const nextRow = currentRow + direction.row;
      const nextColumn = currentColumn + direction.column;
      if (
        nextRow < 0 ||
        nextRow >= puzzle.size ||
        nextColumn < 0 ||
        nextColumn >= puzzle.size
      ) {
        continue;
      }

      const nextIndex = nextRow * puzzle.size + nextColumn;
      if (path.has(nextIndex) || isBlocked(puzzle, nextIndex, lockedEmptyIndices)) continue;

      const currentPlacement = placements[currentIndex];
      if (!currentPlacement) continue;
      const currentOptions = currentPlacement.fixed === 'none'
        ? existingPlacements?.[currentIndex]?.type
          ? [currentPlacement]
          : COMPONENT_OPTIONS
          .filter((component) =>
            component.arms.includes(direction.direction) &&
            (incomingArm === null || component.arms.includes(incomingArm))
          )
          .map((component) => ({
            type: component.type,
            rotation: component.rotation,
            fixed: 'none' as const,
          }))
        : [currentPlacement];

      for (const currentOption of currentOptions) {
        if (context.stopped) return;
        const nextPlacements = placements.slice();
        nextPlacements[currentIndex] = currentOption;
        const evaluation = evaluate(puzzle, nextPlacements);
        if (
          !isEvaluationValid(evaluation, protectedReceiverIndices) ||
          (context.best && evaluation.hardwareCost >= context.best.cost) ||
          !canReachAllReceivers(puzzle, evaluation)
        ) {
          continue;
        }
        const currentArms = evaluation.connections.get(currentIndex) ?? [];
        if (
          !currentArms.includes(direction.direction) ||
          (incomingArm !== null && !currentArms.includes(incomingArm))
        ) {
          continue;
        }

        const voltage = evaluation.voltages.get(currentIndex) ?? 0;
        if (voltage <= 0) continue;
        if (
          !canReachReceiver(
            puzzle,
            evaluation,
            targetIndex,
            targetVoltage
          )
        ) {
          continue;
        }

        if (
          nextIndex === targetIndex &&
          evaluation.receivers.some(
            (receiver) => receiver.index === targetIndex && receiver.met
          )
        ) {
          connectRemainingReceivers(nextPlacements);
          continue;
        }

        const nextPath = new Set(path);
        nextPath.add(nextIndex);
        routeToReceiver(
          nextIndex,
          direction.opposite,
          targetIndex,
          targetVoltage,
          nextPlacements,
          nextPath,
          protectedReceiverIndices
        );
      }
    }
  };

  connectRemainingReceivers(initialPlacements);
  return {
    placements: context.best?.placements ?? null,
    cost: context.best?.cost ?? null,
    optimal: !context.stopped,
  };
};

export const solve = (
  puzzle: Puzzle,
  existingPlacements?: readonly Placement[],
  options: SolverOptions = {}
): Placement[] | null =>
  solveDetailed(puzzle, existingPlacements, options).placements;
