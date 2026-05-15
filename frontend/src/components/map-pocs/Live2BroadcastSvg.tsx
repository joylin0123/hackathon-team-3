import { useMemo } from 'react';
import { line as d3Line, curveCatmullRomClosed } from 'd3-shape';
import { scaleSequential } from 'd3-scale';
import { interpolateTurbo } from 'd3-scale-chromatic';
import { IDEAL_LINE, ZANDVOORT_CORNERS, SECTOR_BOUNDARIES } from '../../constants/zandvoort';
import type { TrackVizProps } from './TrackVizProps';

const VIEW_W = 1000;
const VIEW_H = 700;
const PAD = 60;

function buildProjector(points: [number, number][]) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  const meanLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((meanLat * Math.PI) / 180);
  const spanLat = maxLat - minLat;
  const spanLon = (maxLon - minLon) * lonScale;
  const scale = Math.min((VIEW_W - 2 * PAD) / spanLon, (VIEW_H - 2 * PAD) / spanLat);
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;
  return (lat: number, lon: number): [number, number] => {
    const x = VIEW_W / 2 + (lon - cx) * lonScale * scale;
    const y = VIEW_H / 2 - (lat - cy) * scale;
    return [x, y];
  };
}

export function Live2BroadcastSvg({ records, latest, replayRecord }: TrackVizProps) {
  const project = useMemo(() => buildProjector(IDEAL_LINE), []);

  const idealPath = useMemo(() => {
    const projected = IDEAL_LINE.map(([lat, lon]) => project(lat, lon));
    return d3Line().curve(curveCatmullRomClosed.alpha(0.5))(projected) ?? '';
  }, [project]);

  const speedSegments = useMemo(() => {
    if (records.length < 2) return [];
    const maxSpeed = Math.max(...records.map((r) => r.speed ?? 0), 1);
    const colorScale = scaleSequential(interpolateTurbo).domain([0, maxSpeed]);
    const segs: { d: string; color: string }[] = [];
    for (let i = 1; i < records.length; i++) {
      const a = records[i - 1];
      const b = records[i];
      if (a.latitude == null || b.latitude == null) continue;
      const [x1, y1] = project(a.latitude, a.longitude);
      const [x2, y2] = project(b.latitude, b.longitude);
      const avg = ((a.speed ?? 0) + (b.speed ?? 0)) / 2;
      segs.push({ d: `M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`, color: colorScale(avg) });
    }
    return segs;
  }, [records, project]);

  const car = (replayRecord ?? latest);
  const carPos = car && car.latitude ? project(car.latitude, car.longitude) : null;

  const sectorTickIdx = [SECTOR_BOUNDARIES.sector1EndIdx, SECTOR_BOUNDARIES.sector2EndIdx];
  const sectorTicks = sectorTickIdx.map((idx) => {
    const [lat, lon] = IDEAL_LINE[idx];
    return project(lat, lon);
  });

  const startFinish = project(IDEAL_LINE[0][0], IDEAL_LINE[0][1]);

  return (
    <div className="relative rounded-lg overflow-hidden border border-white/10 h-full bg-gradient-to-br from-[#001a18] via-[#002822] to-[#001a18]">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        <defs>
          <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(53,253,173,0.05)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={VIEW_W} height={VIEW_H} fill="url(#grid)" />

        {/* Track shadow (asphalt) */}
        <path d={idealPath} stroke="#0f1a18" strokeWidth="28" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {/* Track surface */}
        <path d={idealPath} stroke="#1f2d2a" strokeWidth="22" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {/* Curbs / outline */}
        <path d={idealPath} stroke="rgba(255,255,255,0.18)" strokeWidth="22" fill="none" strokeDasharray="3 6" strokeLinejoin="round" strokeLinecap="round" />
        {/* Glow under ideal racing line */}
        <path d={idealPath} stroke="#35fdad" strokeWidth="3" fill="none" opacity="0.4" filter="url(#lineGlow)" strokeLinejoin="round" strokeLinecap="round" />
        {/* Ideal racing line */}
        <path d={idealPath} stroke="#35fdad" strokeWidth="1.5" fill="none" strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />

        {/* Speed-colored driven segments */}
        {speedSegments.map((s, i) => (
          <path key={i} d={s.d} stroke={s.color} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.95" />
        ))}

        {/* Start/finish line */}
        <circle cx={startFinish[0]} cy={startFinish[1]} r="10" fill="none" stroke="#fff" strokeWidth="2" />
        <text x={startFinish[0] + 14} y={startFinish[1] - 8} fill="#fff" fontSize="11" fontFamily="monospace" fontWeight="bold">
          S/F
        </text>

        {/* Sector boundary ticks */}
        {sectorTicks.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="6" fill="#fbbf24" stroke="#000" strokeWidth="1" />
            <text x={x + 10} y={y - 6} fill="#fbbf24" fontSize="10" fontFamily="monospace">S{i + 1}|S{i + 2}</text>
          </g>
        ))}

        {/* Corner labels */}
        {ZANDVOORT_CORNERS.filter((c) => ['Tarzan', 'Hugenholtz', 'Scheivlak', 'Hans Ernst A', 'Arie Luyendyk', 'Masters'].includes(c.shortName)).map((c) => {
          const [x, y] = project(c.lat, c.lon);
          return (
            <g key={c.number}>
              <circle cx={x} cy={y} r="3" fill="#35fdad" />
              <text x={x + 8} y={y + 3} fill="rgba(255,255,255,0.7)" fontSize="10" fontFamily="monospace">
                T{c.number} {c.shortName}
              </text>
            </g>
          );
        })}

        {/* Car marker */}
        {carPos && (
          <g filter="url(#carGlow)">
            <circle cx={carPos[0]} cy={carPos[1]} r="10" fill="#fbbf24" stroke="#fff" strokeWidth="2" />
            <circle cx={carPos[0]} cy={carPos[1]} r="4" fill="#fff" />
          </g>
        )}
      </svg>

      {/* HUD */}
      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded px-3 py-2 text-xs text-white space-y-0.5 font-mono">
        <div className="text-[#35fdad] font-bold tracking-widest text-[10px]">LIVE-2 · BROADCAST SVG</div>
        <div className="text-white/60">Zandvoort · 4.259 km</div>
        {car && (
          <>
            <div className="mt-1 text-white">Speed: <span className="text-[#fbbf24] font-bold">{Math.round(car.speed ?? 0)}</span> km/h</div>
            <div className="text-white/60">Course: {Math.round(car.course ?? 0)}°</div>
          </>
        )}
      </div>

      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-white/50 font-mono">
        d3 · SVG · no map tiles
      </div>
    </div>
  );
}
