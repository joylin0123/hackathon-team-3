import { Polyline } from 'react-leaflet';
import { IDEAL_LINE } from '../../constants/zandvoort';
import { SECTOR_INDEX_RANGES, SECTORS, type Sector, type Severity } from '../../lib/SectorEngine';
import { useSectorEngine } from '../../hooks/useSectorEngine';

const SEVERITY_COLORS: Record<Severity, string> = {
  none: '#64748b', // slate — no baseline yet
  green: '#35fdad',
  amber: '#facc15',
  red: '#ef4444',
};

export function SectorOverlay() {
  const engine = useSectorEngine();
  const current = engine.currentSector();
  const live = engine.liveSeverity();

  return (
    <>
      {SECTORS.map((s) => {
        const [start, end] = SECTOR_INDEX_RANGES[s];
        const positions = IDEAL_LINE.slice(start, end + 1);
        const severity = live[s];
        const isCurrent = current === s;
        return [
          <Polyline
            key={`${s}-outline`}
            positions={positions}
            pathOptions={{
              color: '#000',
              weight: isCurrent ? 12 : 9,
              opacity: 0.55,
            }}
          />,
          <Polyline
            key={`${s}-color`}
            positions={positions}
            pathOptions={{
              color: SEVERITY_COLORS[severity],
              weight: isCurrent ? 8 : 5,
              opacity: isCurrent ? 1 : 0.85,
            }}
          />,
        ];
      })}
    </>
  );
}
