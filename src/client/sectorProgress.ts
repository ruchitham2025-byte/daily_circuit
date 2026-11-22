const SECTOR_TITLES = [
  'VOLTAGE DECAY',
  'SIGNAL BOOST',
  'SPLITTER ARRAY',
  'HAZARD ZONE',
  'TARGET BUDGET',
  'PHASE SHIFT',
  'CROSSTALK',
  'NIGHT GRID',
  'DEEP CURRENT',
  'GHOST SIGNAL',
  'BLACKOUT',
  'ZERO DAY',
  'STATIC BLOOM',
  'REDLINE',
  'ION STORM',
  'DARK MATTER',
  'OVERDRIVE',
  'COLD START',
  'NEXUS',
  'PHANTOM TRACE',
  'AFTERGLOW',
  'SINGULARITY',
  'ECHO CHAMBER',
  'VOID RUNNER',
  'NIGHT SHIFT',
  'QUANTUM LOOP',
  'LAST MILE',
  'CORE MEMORY',
  'FINAL RELAY',
  'CIRCUIT BREAKER',
];

export const campaignSectorTitle = (levelId: number): string => {
  const title = SECTOR_TITLES[levelId - 1];
  if (!title) throw new Error(`Unknown campaign sector: ${levelId}`);
  return title;
};
