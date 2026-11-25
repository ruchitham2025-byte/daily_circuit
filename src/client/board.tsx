import { useRef } from 'react';
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
  const activePointer = useRef<{ id: number; lastCell: number } | null>(null);
  return (
    <div className="chassis">
      <div className="machine-label">
        <i />
        <span>DC-06 POWER ROUTING UNIT</span>
        <i />
      </div>
      <div
        className={`sockets ${result.hazardPowered ? 'overloaded' : ''}`}
        style={{
          gridTemplateColumns: `repeat(${level.size},minmax(0,1fr))`,
          gridTemplateRows: `repeat(${level.size},minmax(0,1fr))`,
        }}
        onPointerUp={(event) => {
          if (activePointer.current?.id === event.pointerId) {
            activePointer.current = null;
          }
        }}
        onPointerCancel={() => {
          activePointer.current = null;
        }}
      >
        {grid.map((p, i) => {
          const live = (result.voltages.get(i) ?? 0) > 0;
          const receiver = result.receivers.find((r) => r.index === i);
          return (
            <button
              key={i}
              data-cell={i}
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0) return;
                event.preventDefault();
                activePointer.current = { id: event.pointerId, lastCell: i };
                onCell(i);
              }}
              onPointerEnter={(event) => {
                const pointer = activePointer.current;
                if (!pointer || pointer.id !== event.pointerId || pointer.lastCell === i) return;
                pointer.lastCell = i;
                onCell(i);
              }}
              onClick={(event) => {
                if (event.detail === 0) onCell(i);
              }}
              className={`socket ${p.fixed} ${p.type && p.fixed === 'none' ? 'fitted' : ''} ${live ? 'energized' : ''} ${receiver?.met ? 'receiver-charged' : ''}`}
              aria-label={`${String.fromCharCode(65 + Math.floor(i / level.size))}${1 + (i % level.size)}: ${p.fixed === 'none' ? (p.type ? names[p.type] ?? 'part' : 'empty socket') : p.fixed}${receiver ? ` needs ${receiver.requiredVoltage} volts` : ''}`}
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
                        ? `${receiver?.requiredVoltage ?? 0}V`
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
