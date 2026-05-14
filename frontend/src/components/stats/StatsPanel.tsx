import { SpeedGauge } from './SpeedGauge';
import { LapTimerCard } from './LapTimerCard';
import { SectorTimesCard } from './SectorTimesCard';
import { useTelemetryStore } from '../../store/telemetryStore';

export function StatsPanel() {
  const records = useTelemetryStore((s) => s.records);
  const latest = records[records.length - 1];

  return (
    <div className="flex flex-col gap-3 h-full">
      <SpeedGauge />
      <LapTimerCard />
      <SectorTimesCard />

      {latest && (
        <div className="bg-white/5 rounded-lg p-3 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-white/40">Lat G</div>
            <div className="font-mono text-sm">{(latest.acc_y / 9.81).toFixed(2)}g</div>
          </div>
          <div>
            <div className="text-white/40">Long G</div>
            <div className="font-mono text-sm">{(latest.acc_x / 9.81).toFixed(2)}g</div>
          </div>
          <div>
            <div className="text-white/40">Yaw rate</div>
            <div className="font-mono text-sm">{latest.yaw_rate.toFixed(2)} r/s</div>
          </div>
          <div>
            <div className="text-white/40">GPS sats</div>
            <div className="font-mono text-sm">{latest.satellites}</div>
          </div>
          <div>
            <div className="text-white/40">Temp</div>
            <div className="font-mono text-sm">{latest.temperature.toFixed(1)}°C</div>
          </div>
          <div>
            <div className="text-white/40">Altitude</div>
            <div className="font-mono text-sm">{latest.altitude.toFixed(1)}m</div>
          </div>
        </div>
      )}
    </div>
  );
}
