import { Polyline } from 'react-leaflet';
import { IDEAL_LINE } from '../../constants/zandvoort';

export function IdealLinePath() {
  return (
    <Polyline
      positions={IDEAL_LINE}
      pathOptions={{ color: '#35fdad', weight: 2, dashArray: '6 4', opacity: 0.8 }}
    />
  );
}
