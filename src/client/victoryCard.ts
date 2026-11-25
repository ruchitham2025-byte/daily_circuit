import type { Placement } from './rules';
import type { DailyLevel } from './puzzles';
import { showToast } from '@devvit/web/client';

type VictoryCardInput = {
  level: DailyLevel;
  grid: Placement[];
  voltages: ReadonlyMap<number, number>;
  grade: string;
  cost: number;
};

const ink = '#302839';
const cream = '#fff9e9';
const lavender = '#d9c8ef';
const yellow = '#ffda57';

export const saveVictoryCard = async ({
  level,
  grid,
  voltages,
  grade,
  cost,
}: VictoryCardInput): Promise<void> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1300;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable');

  const mascot = new Image();
  const mascotLoaded = new Promise<void>((resolve, reject) => {
    mascot.onload = () => resolve();
    mascot.onerror = () => reject(new Error('Spark illustration could not be loaded'));
  });
  mascot.src = '/bench-bot.png';
  await mascotLoaded;

  const drawPanel = (x: number, y: number, width: number, height: number, fill: string) => {
    context.fillStyle = ink;
    context.fillRect(x + 7, y + 8, width, height);
    context.fillStyle = fill;
    context.fillRect(x, y, width, height);
    context.strokeStyle = ink;
    context.lineWidth = 5;
    context.strokeRect(x, y, width, height);
  };

  context.fillStyle = cream;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = ink;
  context.lineWidth = 18;
  context.strokeRect(20, 20, 960, 1260);

  drawPanel(55, 55, 890, 110, yellow);
  context.fillStyle = ink;
  context.font = '800 48px Impact, sans-serif';
  context.fillText('DAILY CIRCUIT', 82, 122);
  context.font = '700 22px monospace';
  context.textAlign = 'right';
  context.fillText('FIELD REPORT / 001', 910, 120);
  context.textAlign = 'left';

  drawPanel(65, 205, 405, 280, lavender);
  const imageRatio = Math.min(365 / mascot.width, 240 / mascot.height);
  const imageWidth = mascot.width * imageRatio;
  const imageHeight = mascot.height * imageRatio;
  context.drawImage(
    mascot,
    85 + (365 - imageWidth) / 2,
    225 + (240 - imageHeight) / 2,
    imageWidth,
    imageHeight
  );
  context.fillStyle = ink;
  context.font = '700 18px monospace';
  context.fillText('SPARK / CHIEF SOLDERER', 85, 465);

  drawPanel(535, 205, 395, 280, yellow);
  context.textAlign = 'center';
  context.font = '800 208px Impact, sans-serif';
  context.fillText(grade, 732, 420);
  context.font = '800 26px monospace';
  context.fillText('RANK', 732, 457);
  context.textAlign = 'left';

  context.fillStyle = ink;
  context.font = '800 34px Impact, sans-serif';
  context.fillText(level.title, 70, 555, 850);
  context.font = '700 21px monospace';
  context.fillText(
    `${level.mode === 'daily' ? 'DATE' : 'SECTOR'}  /  ${level.date.toUpperCase()}`,
    70,
    594
  );

  drawPanel(65, 630, 515, 515, '#b49adc');
  context.fillStyle = ink;
  context.font = '800 26px Impact, sans-serif';
  context.fillText('SOLVED BOARD', 88, 671);
  const boardX = 88;
  const boardY = 695;
  const boardSize = 468;
  const cellSize = boardSize / level.size;
  context.fillStyle = '#60516d';
  context.fillRect(boardX - 6, boardY - 6, boardSize + 12, boardSize + 12);

  for (let index = 0; index < level.size ** 2; index += 1) {
    const placement = grid[index];
    if (!placement) continue;
    const row = Math.floor(index / level.size);
    const column = index % level.size;
    const x = boardX + column * cellSize;
    const y = boardY + row * cellSize;
    const color =
      placement.fixed === 'source'
        ? yellow
        : placement.fixed === 'target'
          ? '#9bd4a3'
          : placement.fixed === 'booster'
            ? '#83d6ce'
            : placement.fixed === 'hazard'
              ? '#ed929d'
              : placement.fixed === 'wall'
                ? '#95899e'
                : placement.type > 0 && voltages.has(index)
                  ? '#ffda57'
                  : cream;
    context.fillStyle = color;
    context.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    context.strokeStyle = ink;
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    const marker =
      placement.fixed === 'source'
        ? 'C'
        : placement.fixed === 'target'
          ? 'R'
          : placement.fixed === 'booster'
            ? '+'
            : placement.fixed === 'hazard'
              ? '!'
              : '';
    if (marker) {
      context.fillStyle = ink;
      context.font = `800 ${Math.max(14, cellSize * 0.42)}px monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(marker, x + cellSize / 2, y + cellSize / 2);
    }
  }
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';

  drawPanel(625, 630, 305, 230, cream);
  context.fillStyle = ink;
  context.font = '700 20px monospace';
  context.fillText('COST VS TARGET', 650, 678);
  context.font = '800 54px Impact, sans-serif';
  context.fillText(`${cost}`, 650, 746);
  context.font = '700 25px monospace';
  context.fillText(`/ ${level.targetCost}`, 755, 742);
  context.font = '700 19px monospace';
  context.fillText('FINAL BUILD COST', 650, 800);

  drawPanel(625, 895, 305, 250, lavender);
  context.fillStyle = ink;
  context.font = '800 30px Impact, sans-serif';
  context.fillText('CIRCUIT COMPLETE', 650, 946);
  context.font = '700 20px monospace';
  context.fillText(`SECTOR ${String(level.id).padStart(2, '0')}`, 650, 996);
  context.fillText('BUILT WITH SPARK', 650, 1033);
  context.font = '800 44px Impact, sans-serif';
  context.fillText('STAY ELECTRIC.', 650, 1096);

  context.fillStyle = ink;
  context.font = '700 18px monospace';
  context.textAlign = 'center';
  context.fillText('ROUTE THE CURRENT. OWN THE GRID.', 500, 1210);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('PNG clipboard access is unavailable');
  }
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
  showToast('Victory card copied to clipboard as PNG.');
};