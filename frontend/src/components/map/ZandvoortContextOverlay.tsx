import { CircleMarker, Tooltip } from 'react-leaflet';
import { IDEAL_LINE, TURN_LABELS } from '../../constants/zandvoort';

const BANKED_TURNS = new Set(['T3 (Hugenholtzbocht)', 'T14 (Arie Luyendyk)']);

export function ZandvoortContextOverlay() {
  return (
    <>
      {TURN_LABELS.map((turn) => {
        const point = IDEAL_LINE[turn.idx];
        const banked = BANKED_TURNS.has(turn.name);
        return (
          <CircleMarker
            key={turn.name}
            center={point}
            radius={banked ? 5 : 4}
            pathOptions={{
              color: banked ? '#a855f7' : '#f8fafc',
              fillColor: banked ? '#a855f7' : '#003530',
              fillOpacity: banked ? 0.9 : 0.75,
              weight: 2,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -6]}>
              <span className="text-[10px] font-mono">
                {turn.name}
                {banked ? ' · banked' : ''}
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}
