import { useMemo } from 'react';
import { CircleMarker, Tooltip } from 'react-leaflet';
import { useTelemetryStore } from '../../store/telemetryStore';
import { sampleDriverStateMarkers, STATE_LABEL } from '../../lib/driverStateOverlay';

export function DriverStateMarkers() {
  const records = useTelemetryStore((s) => s.records);
  const markers = useMemo(() => sampleDriverStateMarkers(records, 6), [records]);

  return (
    <>
      {markers.map((m, i) => (
        <CircleMarker
          key={i}
          center={[m.lat, m.lon]}
          radius={4}
          pathOptions={{
            color: '#000',
            weight: 1,
            fillColor: m.color,
            fillOpacity: 0.9,
          }}
        >
          <Tooltip direction="top" offset={[0, -4]} opacity={0.85}>
            {STATE_LABEL[m.state]}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
