import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { haversineMeters } from '../../lib/lapDetection';

interface SensorSnapshot {
  teamId: number;
  timestamp: number;
  latitude: number;
  longitude: number;
  speed: number;
  yawRate: number;
  satellites: number;
}

export function SensorConsensusView() {
  const allRecords = useTelemetryStore((s) => s.allRecords);
  const selectedSessionId = useTelemetryStore((s) => s.selectedSessionId);

  const consensus = useMemo(() => {
    const scoped = selectedSessionId === null
      ? allRecords
      : allRecords.filter((record) => record.session_id === selectedSessionId);
    const latestBySensor = new Map<number, SensorSnapshot>();

    scoped.forEach((record) => {
      if (record.latitude === null || record.longitude === null) return;
      const existing = latestBySensor.get(record.team_id);
      if (existing && existing.timestamp > record.timestamp) return;
      latestBySensor.set(record.team_id, {
        teamId: record.team_id,
        timestamp: record.timestamp,
        latitude: record.latitude,
        longitude: record.longitude,
        speed: record.speed ?? 0,
        yawRate: record.yaw_rate ?? 0,
        satellites: record.satellites ?? 0,
      });
    });

    const snapshots = Array.from(latestBySensor.values()).sort((a, b) => a.teamId - b.teamId);
    if (snapshots.length === 0) {
      return { snapshots, gpsSpreadM: 0, speedSpread: 0, yawSpread: 0, trusted: null as SensorSnapshot | null };
    }

    const center = {
      latitude: snapshots.reduce((sum, s) => sum + s.latitude, 0) / snapshots.length,
      longitude: snapshots.reduce((sum, s) => sum + s.longitude, 0) / snapshots.length,
    };
    const gpsSpreadM = Math.max(...snapshots.map((s) => haversineMeters(s.latitude, s.longitude, center.latitude, center.longitude)));
    const speedSpread = Math.max(...snapshots.map((s) => s.speed)) - Math.min(...snapshots.map((s) => s.speed));
    const yawSpread = Math.max(...snapshots.map((s) => s.yawRate)) - Math.min(...snapshots.map((s) => s.yawRate));
    const trusted = snapshots
      .map((s) => ({
        sensor: s,
        score:
          Math.min(100, (s.satellites / 9) * 50) +
          Math.max(0, 30 - haversineMeters(s.latitude, s.longitude, center.latitude, center.longitude) * 2) +
          Math.max(0, 20 - Math.abs(s.speed - snapshots.reduce((sum, x) => sum + x.speed, 0) / snapshots.length)),
      }))
      .sort((a, b) => b.score - a.score)[0]?.sensor ?? null;

    return { snapshots, gpsSpreadM, speedSpread, yawSpread, trusted };
  }, [allRecords, selectedSessionId]);

  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
        Sensor Consensus
      </div>
      <p className="text-white/45 text-xs mb-3">
        Compares the latest reading from each sensor on the same car and recommends the most trustworthy source.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs mb-3">
        <div>
          <div className="text-white/40">GPS spread</div>
          <div className="font-mono text-lg">{consensus.gpsSpreadM.toFixed(1)}m</div>
        </div>
        <div>
          <div className="text-white/40">Speed spread</div>
          <div className="font-mono text-lg">{consensus.speedSpread.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-white/40">Yaw spread</div>
          <div className="font-mono text-lg">{consensus.yawSpread.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-white/40">Trusted</div>
          <div className="font-mono text-lg text-[#35fdad]">
            {consensus.trusted ? `S${consensus.trusted.teamId}` : '-'}
          </div>
        </div>
      </div>

      {consensus.snapshots.length === 0 ? (
        <div className="text-white/30 text-xs italic">No multi-sensor data loaded yet.</div>
      ) : (
        <div className="space-y-1">
          {consensus.snapshots.map((sensor) => (
            <div key={sensor.teamId} className="grid grid-cols-4 gap-2 text-[11px] font-mono text-white/70">
              <span>S{sensor.teamId}</span>
              <span>{sensor.speed.toFixed(0)} km/h</span>
              <span>{sensor.satellites} sats</span>
              <span>{sensor.yawRate.toFixed(2)} yaw</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
