import type { TelemetryRecord } from '../../types/telemetry';

export interface TrackVizProps {
  records: TelemetryRecord[];
  latest?: TelemetryRecord;
  replayRecord?: TelemetryRecord;
}
