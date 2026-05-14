import { useDevices } from './hooks/useDevices';
import { usePollingTelemetry } from './hooks/usePollingTelemetry';
import { RouteMap } from './components/map/RouteMap';
import { StatsPanel } from './components/stats/StatsPanel';
import { TelemetryGraphs } from './components/graphs/TelemetryGraphs';
import { AnalysisPanel } from './components/analysis/AnalysisPanel';
import { TeamSelector } from './components/TeamSelector';

export function App() {
  useDevices();
  usePollingTelemetry();

  return (
    <div className="min-h-screen bg-[#003530] text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/assets/LogowhiteBig.svg" alt="Synadia" className="h-6" />
          <span className="text-white/30 text-sm">|</span>
          <span className="text-[#35fdad] font-mono text-sm font-semibold tracking-wide">
            Zandvoort Telemetry
          </span>
        </div>
        <TeamSelector />
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 min-h-0">
        {/* Top-left: Map */}
        <div className="h-[450px] lg:h-auto">
          <RouteMap />
        </div>

        {/* Top-right: Stats */}
        <div className="overflow-auto">
          <StatsPanel />
        </div>

        {/* Bottom-left: Telemetry Graphs */}
        <div className="bg-white/5 rounded-lg p-3 overflow-auto">
          <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
            Telemetry Graphs
          </div>
          <TelemetryGraphs />
        </div>

        {/* Bottom-right: Analysis */}
        <div className="bg-white/5 rounded-lg p-3 h-[400px] overflow-auto">
          <AnalysisPanel />
        </div>
      </main>
    </div>
  );
}
