export type FixedType = 'none' | 'source' | 'target' | 'wall' | 'booster' | 'hazard';

export type Placement = {
  type: number;
  rotation: number;
  fixed: FixedType;
};

export type Puzzle = {
  size: number;
  source: number;
  targets: readonly { index: number; voltage: number }[];
  boosters: readonly number[];
  walls: readonly number[];
  hazards: readonly number[];
};

export type ReceiverResult = {
  index: number;
  voltage: number;
  requiredVoltage: number;
  met: boolean;
};

export type PuzzleEvaluation = {
  voltages: ReadonlyMap<number, number>;
  receivers: ReceiverResult[];
  hazardPowered: boolean;
  hardwareCost: number;
  totalCost: number;
  connections: ReadonlyMap<number, readonly number[]>;
};

type Direction = {
  row: number;
  column: number;
  direction: number;
  opposite: number;
};

export const DIRECTIONS: readonly Direction[] = [
  { row: -1, column: 0, direction: 0, opposite: 2 },
  { row: 0, column: 1, direction: 1, opposite: 3 },
  { row: 1, column: 0, direction: 2, opposite: 0 },
  { row: 0, column: -1, direction: 3, opposite: 1 },
];

export const SOURCE_VOLTAGE = 5;
export const BOOSTER_VOLTAGE = 5;
const COMPONENT_COSTS: Record<number, number> = {
  1: 10,
  2: 15,
  3: 25,
};
const COMPONENT_ARMS: Record<number, readonly number[]> = {
  0: [],
  1: [0, 2],
  2: [0, 1],
  3: [0, 1, 2],
  4: [0, 1, 2, 3],
};
const ALL_ARMS = [0, 1, 2, 3];

const armsFor = (placement: Placement | undefined): number[] => {
  if (!placement || placement.fixed === 'wall') return [];
  if (placement.fixed !== 'none') return ALL_ARMS;
  const arms = COMPONENT_ARMS[placement.type] ?? [];
  return arms.map((arm) => (arm + placement.rotation) % 4);
};

const fixedTypeAt = (puzzle: Puzzle, index: number): FixedType => {
  if (index === puzzle.source) return 'source';
  if (puzzle.targets.some((target) => target.index === index)) return 'target';
  if (puzzle.boosters.includes(index)) return 'booster';
  if (puzzle.walls.includes(index)) return 'wall';
  if (puzzle.hazards.includes(index)) return 'hazard';
  return 'none';
};

export const evaluate = (
  puzzle: Puzzle,
  placements: readonly Placement[],
  additionalCost = 0
): PuzzleEvaluation => {
  const cellCount = puzzle.size * puzzle.size;
  const connections = new Map<number, readonly number[]>();
  const effectivePlacements: (Placement | undefined)[] = [];
  let hardwareCost = 0;

  for (let index = 0; index < cellCount; index += 1) {
    const placement = placements[index];
    if (!placement) {
      effectivePlacements.push(undefined);
      connections.set(index, []);
      continue;
    }
    const effectivePlacement = { ...placement, fixed: fixedTypeAt(puzzle, index) };
    effectivePlacements.push(effectivePlacement);
    connections.set(index, armsFor(effectivePlacement));
    if (effectivePlacement.fixed === 'none' && effectivePlacement.type > 0) {
      hardwareCost += COMPONENT_COSTS[effectivePlacement.type] ?? 10;
    }
  }

  const voltages = new Map<number, number>([[puzzle.source, SOURCE_VOLTAGE]]);
  const queue: { index: number; voltage: number }[] = [
    { index: puzzle.source, voltage: SOURCE_VOLTAGE },
  ];
  let hazardPowered = false;

  while (queue.length > 0) {
    queue.sort((left, right) => right.voltage - left.voltage);
    const current = queue.shift();
    if (!current || current.voltage <= 0) continue;

    const row = Math.floor(current.index / puzzle.size);
    const column = current.index % puzzle.size;
    const currentConnections = connections.get(current.index) ?? [];

    for (const direction of DIRECTIONS) {
      if (!currentConnections.includes(direction.direction)) continue;
      const nextRow = row + direction.row;
      const nextColumn = column + direction.column;
      if (
        nextRow < 0 ||
        nextRow >= puzzle.size ||
        nextColumn < 0 ||
        nextColumn >= puzzle.size
      ) {
        continue;
      }

      const nextIndex = nextRow * puzzle.size + nextColumn;
      const nextPlacement = effectivePlacements[nextIndex];
      const nextConnections = connections.get(nextIndex) ?? [];
      if (!nextPlacement || !nextConnections.includes(direction.opposite)) continue;
      if (nextPlacement.fixed === 'hazard') hazardPowered = true;

      const nextVoltage =
        nextPlacement.fixed === 'booster'
          ? BOOSTER_VOLTAGE
          : current.voltage - 1;
      if (
        nextVoltage > (voltages.get(nextIndex) ?? -1) &&
        nextVoltage >= 0
      ) {
        voltages.set(nextIndex, nextVoltage);
        queue.push({ index: nextIndex, voltage: nextVoltage });
      }
    }
  }

  const receivers = puzzle.targets.map((target) => {
    const voltage = voltages.get(target.index) ?? 0;
    return {
      index: target.index,
      voltage,
      requiredVoltage: target.voltage,
      met: voltage >= target.voltage,
    };
  });

  return {
    voltages,
    receivers,
    hazardPowered,
    hardwareCost,
    totalCost: hardwareCost + additionalCost,
    connections,
  };
};
