// Zandvoort ideal racing line — ~42 GPS waypoints [lat, lon], clockwise from S/F
export const IDEAL_LINE: [number, number][] = [
  [52.38860, 4.54165], // Start/Finish
  [52.38840, 4.54080],
  [52.38810, 4.53990],
  [52.38790, 4.53880],
  [52.38770, 4.53760], // Turn 1 entry
  [52.38740, 4.53650], // Turn 1 apex (Tarzanbocht)
  [52.38720, 4.53570],
  [52.38690, 4.53520],
  [52.38660, 4.53480],
  [52.38620, 4.53450],
  [52.38580, 4.53420],
  [52.38540, 4.53400],
  [52.38490, 4.53380], // Turn 3 entry
  [52.38450, 4.53370], // Turn 3 apex (Hugenholtzbocht) — SECTOR 1 END
  [52.38410, 4.53390],
  [52.38370, 4.53430],
  [52.38340, 4.53480],
  [52.38310, 4.53540],
  [52.38290, 4.53620], // Turn 5 apex (Scheivlak)
  [52.38280, 4.53700],
  [52.38270, 4.53800],
  [52.38270, 4.53900],
  [52.38280, 4.54000],
  [52.38300, 4.54080], // Turn 7 entry
  [52.38330, 4.54150], // Turn 7 apex (Mastersbocht) — SECTOR 2 END
  [52.38360, 4.54200],
  [52.38400, 4.54230],
  [52.38440, 4.54250],
  [52.38480, 4.54260],
  [52.38520, 4.54280],
  [52.38560, 4.54310],
  [52.38600, 4.54340], // Turn 8 apex (Arie Luyendijk)
  [52.38640, 4.54350],
  [52.38680, 4.54340],
  [52.38720, 4.54310],
  [52.38750, 4.54270],
  [52.38780, 4.54240],
  [52.38800, 4.54220],
  [52.38820, 4.54200], // chicane right apex
  [52.38840, 4.54195], // chicane left apex
  [52.38855, 4.54185],
  [52.38860, 4.54165], // back to S/F
];

export const SECTOR_BOUNDARIES = {
  sector1EndIdx: 13, // Hugenholtzbocht
  sector2EndIdx: 24, // Mastersbocht
};

export const START_FINISH = { lat: 52.38860, lon: 4.54165 };
export const START_FINISH_RADIUS_M = 15;
export const SECTOR_LANDMARK_RADIUS_M = 20;

export const TURN_LABELS: { idx: number; name: string }[] = [
  { idx: 5,  name: 'Turn 1 (Tarzanbocht)' },
  { idx: 13, name: 'Turn 3 (Hugenholtzbocht)' },
  { idx: 18, name: 'Turn 5 (Scheivlak)' },
  { idx: 24, name: 'Turn 7 (Mastersbocht)' },
  { idx: 31, name: 'Turn 8 (Arie Luyendijk)' },
  { idx: 39, name: 'Final Chicane' },
];
