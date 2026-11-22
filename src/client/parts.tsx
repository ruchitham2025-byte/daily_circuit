import { Zap, Skull, ChevronsUp, Eraser, RadioReceiver } from 'lucide-react';
export function Part({
  type,
  rotation = 0,
  live = false,
}: {
  type: number;
  rotation?: number;
  live?: boolean;
}) {
  const path =
    type === 1
      ? 'M8 32H56'
      : type === 2
        ? 'M32 7V27Q32 32 37 32H56'
        : 'M8 32H56M32 32V7';
  return type === 0 ? (
    <Eraser />
  ) : (
    <svg
      className="component"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      style={{ transform: `rotate(${rotation * 90}deg)` }}
    >
      <g strokeLinecap="butt" strokeLinejoin="round">
        <path d={path} stroke="#28232f" strokeWidth="17" />
        <path d={path} stroke={live ? '#83efbc' : '#b8a4dc'} strokeWidth="11" />
        <path d={path} stroke={live ? '#ddffda' : '#ded2ed'} strokeWidth="3" />
        {(type === 1
          ? [
              [7, 25, 9, 14],
              [48, 25, 9, 14],
            ]
          : type === 2
            ? [
                [25, 5, 14, 9],
                [48, 25, 9, 14],
              ]
            : [
                [7, 25, 9, 14],
                [48, 25, 9, 14],
                [25, 5, 14, 9],
              ]
        ).map(([x, y, w, h], i) => (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            rx="1"
            fill="#ffe081"
            stroke="#302737"
            strokeWidth="2.6"
          />
        ))}
        {live && (
          <path className="flow" d={path} stroke="white" strokeWidth="3" />
        )}
      </g>
    </svg>
  );
}
export function Device({ kind }: { kind: string }) {
  return kind === 'source' ? (
    <Zap fill="currentColor" />
  ) : kind === 'booster' ? (
    <ChevronsUp />
  ) : kind === 'hazard' ? (
    <Skull />
  ) : (
    <RadioReceiver />
  );
}
