import type { DailyLevel } from './puzzles';
import type { Placement, PuzzleEvaluation } from './rules';

type Grade = 'S' | 'A' | 'B' | 'C';

const INK = '#302839';
const CREAM = '#fff9e9';
const LILAC = '#d9c8ef';
const YELLOW = '#ffda57';
const GREEN = '#9bd4a3';
const TEAL = '#83d6ce';
const PINK = '#ed929d';
const LAVENDER = '#b49adc';

const TILE_COLORS: Record<string, string> = {
  source: YELLOW,
  target: GREEN,
  booster: TEAL,
  hazard: PINK,
  wall: '#95899e',
};

const GRADE_COLORS: Record<Grade, string> = {
  S: '#ffda57',
  A: '#9bd4a3',
  B: '#83d6ce',
  C: '#ed929d',
};

const GRADE_QUIPS: Record<Grade, string> = {
  S: 'FLAWLESS CIRCUITRY!',
  A: 'TIGHT WORK — ALIASING NEXT TIME?',
  B: 'NOT BAD. COULD BE TIGHTER.',
  C: 'IT WORKS... BARELY.',
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  placement: Placement,
  level: DailyLevel,
  index: number,
  live: boolean
): void {
  const r = size * 0.12;
  const isFixed = placement.fixed !== 'none';
  const bg = isFixed ? (TILE_COLORS[placement.fixed] ?? CREAM) : live ? '#bce2c2' : '#e4daed';
  ctx.fillStyle = bg;
  roundRect(ctx, x + 1, y + 1, size - 2, size - 2, r);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (isFixed) {
    const fontSize = Math.max(6, size * 0.24);
    ctx.fillStyle = INK;
    ctx.font = `800 ${fontSize}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label =
      placement.fixed === 'source'
        ? '5V'
        : placement.fixed === 'target'
          ? `${level.targets.find((t) => t.index === index)?.voltage ?? 0}V`
          : placement.fixed === 'booster'
            ? '+5'
            : placement.fixed === 'hazard'
              ? '!'
              : '';
    ctx.fillText(label, x + size / 2, y + size / 2);
  } else if (placement.type > 0 && live) {
    ctx.fillStyle = '#83efbc';
    ctx.fillRect(x + size * 0.2, y + size * 0.45, size * 0.6, size * 0.1);
  }
}

export type VictoryCardData = {
  level: DailyLevel;
  grid: readonly Placement[];
  result: PuzzleEvaluation;
  grade: Grade;
  hints: number;
  streak: number;
  levelId: string;
};

export function renderVictoryCard(data: VictoryCardData): HTMLCanvasElement {
  const W = 640;
  const H = 820;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#e4d9f2';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b7a9c9';
  for (let i = 0; i < W; i += 9) {
    for (let j = 0; j < H; j += 9) {
      ctx.beginPath();
      ctx.arc(i, j, 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = CREAM;
  roundRect(ctx, 24, 24, W - 48, H - 48, 14);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.shadowColor = INK;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;
  roundRect(ctx, 24, 24, W - 48, H - 48, 14);
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = INK;
  ctx.font = '800 14px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('DAILY CIRCUIT / FIELD MANUAL', 44, 44);
  ctx.textAlign = 'right';
  ctx.fillText(data.level.date, W - 44, 44);

  ctx.textAlign = 'center';
  ctx.font = '800 36px "Barlow Condensed", Impact, sans-serif';
  ctx.fillText('CIRCUIT COMPLETE', W / 2, 70);

  const badgeColor = GRADE_COLORS[data.grade];
  const bx = W / 2;
  const by = 165;
  const br = 62;
  ctx.fillStyle = badgeColor;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.shadowColor = INK;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 5;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = INK;
  ctx.font = '800 72px "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.grade, bx, by + 4);

  ctx.font = '700 16px "Space Grotesk", sans-serif';
  ctx.fillText(GRADE_QUIPS[data.grade], W / 2, by + br + 26);

  const statsY = 290;
  ctx.textAlign = 'left';
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.fillStyle = INK;
  ctx.fillText('COST', 80, statsY);
  ctx.fillText('TARGET', 250, statsY);
  ctx.fillText('HINTS', 410, statsY);
  ctx.fillText('STREAK', 540, statsY);

  ctx.font = '800 32px "Barlow Condensed", Impact, sans-serif';
  ctx.fillText(`${data.result.totalCost}`, 80, statsY + 18);
  ctx.fillText(`${data.level.targetCost}`, 250, statsY + 18);
  ctx.fillText(`${data.hints}`, 410, statsY + 18);
  ctx.fillText(`${data.streak}`, 540, statsY + 18);

  const labelY = statsY + 72;
  ctx.textAlign = 'center';
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.fillStyle = INK;
  ctx.fillText('SECTOR DIAGRAM', W / 2, labelY);

  const gridSize = data.level.size;
  const maxBoardW = W - 120;
  const maxBoardH = 240;
  const cellSize = Math.floor(Math.min(maxBoardW / gridSize, maxBoardH / gridSize));
  const boardW = cellSize * gridSize;
  const boardH = cellSize * gridSize;
  const boardX = (W - boardW) / 2;
  const boardY = labelY + 18;

  ctx.fillStyle = '#60516d';
  roundRect(ctx, boardX - 6, boardY - 6, boardW + 12, boardH + 12, 6);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  for (let i = 0; i < data.grid.length; i += 1) {
    const col = i % gridSize;
    const row = Math.floor(i / gridSize);
    const live = (data.result.voltages.get(i) ?? 0) > 0;
    drawTile(ctx, boardX + col * cellSize, boardY + row * cellSize, cellSize, data.grid[i], data.level, i, live);
  }

  const footY = boardY + boardH + 24;
  ctx.textAlign = 'center';
  ctx.font = '700 12px ui-monospace, monospace';
  ctx.fillStyle = '#514359';
  ctx.fillText(`${data.level.title} · ${data.levelId} · DAILY CIRCUIT`, W / 2, footY);
  ctx.font = '700 10px ui-monospace, monospace';
  ctx.fillText('SAVE & SHARE YOUR CIRCUIT', W / 2, footY + 20);

  return canvas;
}

export function downloadVictoryCard(data: VictoryCardData): void {
  const canvas = renderVictoryCard(data);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-circuit-${data.level.date}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export { GRADE_QUIPS, GRADE_COLORS };
