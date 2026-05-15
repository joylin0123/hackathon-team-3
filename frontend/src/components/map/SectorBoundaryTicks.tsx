import L from 'leaflet';
import { Marker, Polyline } from 'react-leaflet';
import { IDEAL_LINE } from '../../constants/zandvoort';
import { SECTOR_INDEX_RANGES } from '../../lib/SectorEngine';

/**
 * Renders perpendicular tick marks at the two inter-sector boundaries and at
 * start/finish, plus a divIcon label so judges can read where S1/S2/S3
 * actually start. Geometry: pick the two IDEAL_LINE samples around the
 * boundary, take their normal vector, draw a short segment across.
 */
export function SectorBoundaryTicks() {
  const s1End = SECTOR_INDEX_RANGES.s1[1];
  const s2End = SECTOR_INDEX_RANGES.s2[1];

  const boundaries = [
    { idx: 0, label: 'S/F' },
    { idx: s1End, label: 'S1 | S2' },
    { idx: s2End, label: 'S2 | S3' },
  ];

  return (
    <>
      {boundaries.flatMap(({ idx, label }) => {
        const tick = perpendicularTick(idx);
        return [
          <Polyline
            key={`${label}-line`}
            positions={tick}
            pathOptions={{ color: '#ffffff', weight: 3, opacity: 0.9, dashArray: '4 3' }}
          />,
          <Marker
            key={`${label}-label`}
            position={tick[1]}
            icon={tickLabel(label)}
            interactive={false}
          />,
        ];
      })}
    </>
  );
}

function perpendicularTick(idx: number): [[number, number], [number, number]] {
  const i0 = Math.max(0, idx - 1);
  const i1 = Math.min(IDEAL_LINE.length - 1, idx + 1);
  const [lat0, lon0] = IDEAL_LINE[i0];
  const [lat1, lon1] = IDEAL_LINE[i1];
  const [latC, lonC] = IDEAL_LINE[idx];
  // Local "flat" approximation is fine at this scale (1 km).
  const dLat = lat1 - lat0;
  const dLon = lon1 - lon0;
  // Perpendicular vector (rotate 90°), normalised then scaled to ~25 m.
  const len = Math.sqrt(dLat * dLat + dLon * dLon) || 1;
  const nLat = -dLon / len;
  const nLon = dLat / len;
  // ~0.0002 deg ≈ 22 m
  const reach = 0.00022;
  return [
    [latC - nLat * reach, lonC - nLon * reach],
    [latC + nLat * reach, lonC + nLon * reach],
  ];
}

function tickLabel(label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background: rgba(0,0,0,0.85);
      color: #ffffff;
      padding: 1px 5px;
      border-radius: 3px;
      font: 700 9px/1 ui-monospace, monospace;
      letter-spacing: 0.05em;
      white-space: nowrap;
      transform: translate(-50%, -130%);
      pointer-events: none;
    ">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
