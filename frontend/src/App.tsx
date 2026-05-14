import { useState } from 'react';
import { useDevices } from './hooks/useDevices';
import { usePollingTelemetry } from './hooks/usePollingTelemetry';
import { RouteMap } from './components/map/RouteMap';
import { StatsPanel } from './components/stats/StatsPanel';
import { TelemetryGraphs } from './components/graphs/TelemetryGraphs';
import { AnalysisPanel } from './components/analysis/AnalysisPanel';
import { TeamSelector } from './components/TeamSelector';
import { DashboardTabs, type DashboardTab } from './components/DashboardTabs';
import { SensorReliabilityPanel } from './components/analysis/SensorReliabilityPanel';
import { DataConfidenceCard } from './components/stats/DataConfidenceCard';
import { RaceControlFeed } from './components/analysis/RaceControlFeed';

export function App() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

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

      <DashboardTabs activeTab={activeTab} onChange={setActiveTab} />

      <main className="flex-1 p-3 min-h-0">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_420px] gap-3 h-full min-h-0">
            <div className="h-[520px] xl:h-auto min-h-0">
              <RouteMap />
            </div>
            <div className="overflow-auto min-h-0">
              <StatsPanel />
            </div>
          </div>
        )}

        {activeTab === 'telemetry' && (
          <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-3 h-full min-h-0">
            <div className="space-y-3">
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
                  What to read
                </div>
                <p className="text-white/60 text-sm">
                  Use these traces to connect driver inputs and car movement. Speed drops show braking zones,
                  lateral G marks corner load, longitudinal G shows acceleration or braking, and yaw rate shows rotation.
                </p>
              </div>
              <DataConfidenceCard />
            </div>
            <div className="bg-white/5 rounded-lg p-3 overflow-auto min-h-0">
              <TelemetryGraphs />
            </div>
          </div>
        )}

        {activeTab === 'route' && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_520px] gap-3 h-full min-h-0">
            <div className="h-[520px] xl:h-auto min-h-0">
              <RouteMap />
            </div>
            <div className="bg-white/5 rounded-lg p-3 overflow-auto min-h-0">
              <AnalysisPanel mode="route" />
            </div>
          </div>
        )}

        {activeTab === 'sensors' && (
          <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-3 h-full min-h-0">
            <div className="space-y-3">
              <DataConfidenceCard />
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
                  Race Control
                </div>
                <RaceControlFeed />
              </div>
            </div>
            <div className="bg-white/5 rounded-lg p-3 overflow-auto min-h-0">
              <AnalysisPanel mode="sensors" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
