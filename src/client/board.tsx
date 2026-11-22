import type { Placement, PuzzleEvaluation } from './rules';
import type { DailyLevel } from './puzzles';
import { Part, Device } from './parts';
import { names } from './rules';
export function Board({
  level,
  grid,
  result,
  onCell,
}: {
  level: DailyLevel;
  grid: Placement[];
  result: PuzzleEvaluation;
  onCell: (i: number) => void;
}) {
  return (
    <div className="chassis">
      <div className="machine-label">
        <i /> DC–06 <span>POWER ROUTING UNIT</span>
        <i />
      </div>
      <div
        className="sockets"
        style={{
          gridTemplateColumns: `repeat(${level.size},minmax(0,1fr))`,
          gridTemplateRows: `repeat(${level.size},minmax(0,1fr))`,
        }}
      >
        {grid.map((p, i) => {
          const live = (result.voltages.get(i) ?? 0) > 0;
          const receiver = level.targets.find((r) => r.index === i);
          return (
            <button
              key={i}
              onClick={() => onCell(i)}
              className={`socket ${p.fixed} ${p.type && p.fixed === 'none' ? 'fitted' : ''} ${live ? 'energized' : ''}`}
              aria-label={`${String.fromCharCode(65 + Math.floor(i / level.size))}${1 + (i % level.size)}: ${p.fixed === 'none' ? (p.type ? names[p.type] : 'empty socket') : p.fixed}${receiver ? ` needs ${receiver.voltage} volts` : ''}`}
            >
              {p.fixed === 'none' ? (
                p.type ? (
                  <Part
                    type={p.type}
                    rotation={
                      p.rotation + (p.type === 1 ? 1 : p.type === 3 ? 1 : 0)
                    }
                    live={live}
                  />
                ) : (
                  <span className="pins" />
                )
              ) : p.fixed === 'wall' ? (
                <span className="vent" />
              ) : (
                <span className="module">
                  <Device kind={p.fixed} />
                  <small>
                    {p.fixed === 'source'
                      ? '5V'
                      : p.fixed === 'target'
                        ? `${receiver?.voltage}V`
                        : p.fixed === 'booster'
                          ? '+5V'
                          : '!'}
                  </small>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="machine-bottom">
        <i />
        <span className="slots" />
        <span className="serial">DC / LAB SERIES</span>
        <i />
      </div>
    </div>
  );
}
