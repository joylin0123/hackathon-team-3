import L from 'leaflet';
import { Marker } from 'react-leaflet';
import { ZANDVOORT_CORNERS } from '../../constants/zandvoort';

const NAMED_CORNER_NUMBERS = new Set([1, 3, 6, 11, 14]);

const pill = (label: string) =>
  L.divIcon({
    className: '',
    html: `<div style="
      background: rgba(0, 53, 48, 0.85);
      border: 1px solid #35fdad;
      color: #35fdad;
      padding: 2px 6px;
      border-radius: 4px;
      font: 600 10px/1 ui-monospace, monospace;
      letter-spacing: 0.04em;
      white-space: nowrap;
      transform: translate(-50%, -130%);
      pointer-events: none;
      box-shadow: 0 1px 3px rgba(0,0,0,0.5);
    ">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

export function CornerLabels() {
  return (
    <>
      {ZANDVOORT_CORNERS.filter((c) => NAMED_CORNER_NUMBERS.has(c.number)).map((c) => (
        <Marker
          key={c.number}
          position={[c.lat, c.lon]}
          icon={pill(`T${c.number} ${c.shortName}`)}
          interactive={false}
        />
      ))}
    </>
  );
}
