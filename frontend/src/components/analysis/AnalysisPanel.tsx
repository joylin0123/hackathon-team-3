import { DeviationChart } from './DeviationChart';
import { InsightsList } from './InsightsList';

export function AnalysisPanel() {
  return (
    <div className="flex flex-col gap-3 h-full overflow-auto">
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
