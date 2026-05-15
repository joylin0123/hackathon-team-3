// Zandvoort reference line from OpenStreetMap Dutch Grand Prix circuit relation,
// downsampled for browser rendering. Coordinates are [lat, lon], clockwise.
export const IDEAL_LINE: [number, number][] = [
  [52.3889948, 4.5408762], // Start/Finish
  [52.3898187, 4.5414306],
  [52.3916242, 4.5426454],
  [52.3917034, 4.5436346],
  [52.3907992, 4.5434038],
  [52.3900777, 4.5429573],
  [52.3892853, 4.5428846],
  [52.3887467, 4.5416496],
  [52.3881880, 4.5414239],
  [52.3883362, 4.5429243],
  [52.3884832, 4.5440941],
  [52.3884121, 4.5453586],
  [52.3882685, 4.5466068],
  [52.3884375, 4.5477512],
  [52.3888259, 4.5488240],
  [52.3889704, 4.5500026],
  [52.3889210, 4.5514580],
  [52.3886723, 4.5525711],
  [52.3879992, 4.5530565],
  [52.3868913, 4.5521150],
  [52.3858946, 4.5512637],
  [52.3857366, 4.5501115],
  [52.3860056, 4.5489142],
  [52.3865512, 4.5482184],
  [52.3869271, 4.5492146],
  [52.3870803, 4.5503669],
  [52.3875555, 4.5511370],
  [52.3880382, 4.5497835],
  [52.3880560, 4.5485613],
  [52.3879779, 4.5473100],
  [52.3878083, 4.5460337],
  [52.3875677, 4.5448791],
  [52.3872771, 4.5437980],
  [52.3873514, 4.5428769],
  [52.3872150, 4.5419463],
  [52.3852297, 4.5424746],
  [52.3845318, 4.5423352],
  [52.3843701, 4.5406984],
  [52.3845821, 4.5395706],
  [52.3851539, 4.5388448],
  [52.3858684, 4.5387875],
  [52.3869713, 4.5395152],
  [52.3877616, 4.5400465],
  [52.3889948, 4.5408762],
];

export const SECTOR_BOUNDARIES = {
  sector1EndIdx: 9, // Hugenholtzbocht
  sector2EndIdx: 23, // Mastersbocht
};

export const START_FINISH = { lat: 52.3889948, lon: 4.5408762 };
export const START_FINISH_RADIUS_M = 18;
export const SECTOR_LANDMARK_RADIUS_M = 20;

export const TURN_LABELS: { idx: number; name: string }[] = [
  { idx: 2, name: 'T1 (Tarzanbocht)' },
  { idx: 9, name: 'T3 (Hugenholtzbocht)' },
  { idx: 18, name: 'T6 (Scheivlak)' },
  { idx: 23, name: 'T8 (Mastersbocht)' },
  { idx: 35, name: 'Hans Ernst Chicane' },
  { idx: 40, name: 'T14 (Arie Luyendyk)' },
];

/**
 * Circuit Zandvoort corner table — names verbatim from circuitzandvoort.nl,
 * lat/lons anchored to IDEAL_LINE points near each apex (same accuracy class
 * as FastF1's get_circuit_info which is "manually created, sufficient for
 * visualization"). Used by CauseLocalizer's nearestCorner() lookup.
 *
 * Refine on Day 1 if needed.
 */
export interface Corner {
  number: number;
  letter?: string;
  name: string;
  shortName: string;
  lat: number;
  lon: number;
  /** Phrasing reused in narrative cards (verbatim from circuitzandvoort.nl). */
  note?: string;
}

export const ZANDVOORT_CORNERS: Corner[] = [
  { number: 1, name: 'Tarzanbocht', shortName: 'Tarzan', lat: 52.3917034, lon: 4.5436346, note: 'most famous corner' },
  { number: 2, name: 'Gerlachbocht', shortName: 'Gerlach', lat: 52.3892853, lon: 4.5428846, note: 'partly blind' },
  { number: 3, name: 'Hugenholtzbocht', shortName: 'Hugenholtz', lat: 52.3883362, lon: 4.5429243, note: '18° banked' },
  { number: 4, name: 'Hunserug', shortName: 'Hunserug', lat: 52.3884832, lon: 4.5440941, note: 'mild but extremely fast' },
  { number: 5, name: 'Rob Slotemakerbocht', shortName: 'Slotemaker', lat: 52.3884121, lon: 4.5453586 },
  { number: 6, name: 'Scheivlak', shortName: 'Scheivlak', lat: 52.3889210, lon: 4.5514580, note: 'where heroes distinguish themselves from regular drivers' },
  { number: 7, name: 'Scheivlak (exit)', shortName: 'Scheivlak exit', lat: 52.3886723, lon: 4.5525711 },
  { number: 8, name: 'Mastersbocht', shortName: 'Masters', lat: 52.3868913, lon: 4.5521150 },
  { number: 9, name: 'Bocht 9', shortName: 'T9', lat: 52.3858946, lon: 4.5512637 },
  { number: 10, name: 'Bocht Zonder Naam', shortName: 'T10', lat: 52.3860056, lon: 4.5489142 },
  { number: 11, letter: 'A', name: 'Hans Ernst Chicane (entry)', shortName: 'Hans Ernst A', lat: 52.3870803, lon: 4.5503669, note: 'perfect location for overtaking' },
  { number: 12, letter: 'B', name: 'Hans Ernst Chicane (exit)', shortName: 'Hans Ernst B', lat: 52.3875555, lon: 4.5511370, note: 'perfect location for overtaking' },
  { number: 13, name: 'Kumho Kurve', shortName: 'Kumho', lat: 52.3845318, lon: 4.5423352 },
  { number: 14, name: 'Arie Luyendykbocht', shortName: 'Arie Luyendyk', lat: 52.3858684, lon: 4.5387875, note: '18° banking, SAFER barrier' },
];
