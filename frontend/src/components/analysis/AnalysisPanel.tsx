import { DeviationChart } from './DeviationChart';
import { InsightsList } from './InsightsList';
import { CornerCauseCards } from './CornerCauseCards';
import { RaceControlFeed } from './RaceControlFeed';
import { SensorReliabilityPanel } from './SensorReliabilityPanel';
import { SensorConsensusView } from './SensorConsensusView';

interface AnalysisPanelProps {
  mode?: 'full' | 'route' | 'sensors';
}

export function AnalysisPanel({ mode = 'full' }: AnalysisPanelProps) {
  if (mode === 'sensors') {
    return (
      <div className="flex flex-col gap-3 h-full overflow-hidden">
        <div>
          <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
            Sensor Reliability
          </div>
          <p className="text-white/50 text-xs mb-3">
            This view treats team IDs as sensor IDs. It highlights whether the telemetry is fresh,
            well-calibrated, and complete enough to trust during the Zandvoort test.
          </p>
          <SensorReliabilityPanel />
        </div>

        <SensorConsensusView />

        <div>
          <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
            Driver Insights
          </div>
          <InsightsList />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-hidden">
      <div>
        <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
          Corner Cause Analyzer
        </div>
        <p className="text-white/50 text-xs mb-3">
          These diagnostics are likely causes, not verdicts. They combine ideal-line deviation,
          speed, braking proxy, lateral load, yaw response, and sensor confidence.
        </p>
        <CornerCauseCards />
      </div>

      <div>
        <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
          Race Control
        </div>
        <RaceControlFeed />
      </div>

      {mode === 'full' && (
        <div>
          <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
            Sensor Reliability
          </div>
          <SensorReliabilityPanel />
        </div>
      )}

      <div>
        <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
          Deviation from Ideal Line
        </div>
        <DeviationChart />
        <div className="text-white/30 text-xs mt-1">
          X = track position (% of lap) · Y = distance from ideal line (meters)
        </div>
      </div>

      <div>
        <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
          Driver Insights
        </div>
        <InsightsList />
      </div>
    </div>
  );
}
