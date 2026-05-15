import { useEffect, useMemo, useState } from 'react';
import { useDevices } from './hooks/useDevices';
import { usePollingTelemetry } from './hooks/usePollingTelemetry';
import { RouteMap } from './components/map/RouteMap';
import { StatsPanel } from './components/stats/StatsPanel';
import { TelemetryGraphs } from './components/graphs/TelemetryGraphs';
import { TeamSelector } from './components/TeamSelector';
import { DashboardTabs, type DashboardTab } from './components/DashboardTabs';
import { SensorReliabilityPanel } from './components/analysis/SensorReliabilityPanel';
import { DataConfidenceCard } from './components/stats/DataConfidenceCard';
import { RaceControlFeed } from './components/analysis/RaceControlFeed';
import { useTelemetryStore } from './store/telemetryStore';
import { DEFAULT_MAP_LAYERS, type MapLayers } from './components/map/mapLayers';
import { MapLayerControls } from './components/map/MapLayerControls';
import { ReplayControls, type ReplayState } from './components/replay/ReplayControls';
import { DemoDataControls } from './components/data/DemoDataControls';
import { SessionPicker } from './components/data/SessionPicker';
import { SensorConsensusView } from './components/analysis/SensorConsensusView';
import { CornerCauseCards } from './components/analysis/CornerCauseCards';
import { DeviationChart } from './components/analysis/DeviationChart';
import { InsightsList } from './components/analysis/InsightsList';

export function App() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [mapLayers, setMapLayers] = useState<MapLayers>(DEFAULT_MAP_LAYERS);
  const [replay, setReplay] = useState<ReplayState>({
    enabled: false,
    playing: false,
    index: 0,
    speed: 2,
  });
  const records = useTelemetryStore((s) => s.records);

  useDevices();
  usePollingTelemetry();

  useEffect(() => {
    if (!replay.enabled || !replay.playing || records.length < 2) return;
    const id = window.setInterval(() => {
      setReplay((current) => {
        const nextIndex = Math.min(records.length - 1, current.index + current.speed);
        return {
          ...current,
          index: nextIndex,
          playing: nextIndex < records.length - 1,
        };
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [records.length, replay.enabled, replay.playing, replay.speed]);

  useEffect(() => {
    setReplay((current) => ({
      ...current,
      index: Math.min(current.index, Math.max(0, records.length - 1)),
    }));
  }, [records.length]);

  const replayRecord = useMemo(() => {
    if (!replay.enabled || records.length === 0) return undefined;
    return records[Math.min(replay.index, records.length - 1)];
  }, [records, replay.enabled, replay.index]);

  const controls = (
    <>
      <DemoDataControls />
      <SessionPicker />
      <ReplayControls records={records} replay={replay} onChange={setReplay} />
      <MapLayerControls layers={mapLayers} onChange={setMapLayers} />
    </>
  );

  return (
    <div className="h-screen overflow-hidden bg-[#003530] text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
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

      <main className="flex-1 p-3 min-h-0 overflow-hidden">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)] gap-3 h-full min-h-0 overflow-hidden">
            <div className="h-full min-h-0">
              <RouteMap layers={mapLayers} replayRecord={replayRecord} />
            </div>
            <div className="min-h-0 overflow-hidden">
              <StatsPanel />
            </div>
          </div>
        )}

        {activeTab === "controls" && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 h-full min-h-0 overflow-hidden">
            {controls}
          </div>
        )}

        {activeTab === "telemetry" && (
          <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-3 h-full min-h-0 overflow-hidden">
            <div className="space-y-3 min-h-0 overflow-hidden">
              <div className="bg-white/5 rounded-lg p-3">
                <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
                  What to read
                </div>
                <p className="text-white/60 text-sm">
                  Use these traces to connect driver inputs and car movement.
                  Speed drops show braking zones, lateral G marks corner load,
                  longitudinal G shows acceleration or braking, and yaw rate
                  shows rotation.
                </p>
              </div>
              <DataConfidenceCard />
            </div>
            <div className="bg-white/5 rounded-lg p-3 overflow-hidden min-h-0">
              <TelemetryGraphs />
            </div>
          </div>
        )}

        {activeTab === "route" && (
          <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-3 h-full min-h-0 overflow-hidden">
            <div className="min-h-0 overflow-hidden">
              <div className="h-full min-h-0">
                <RouteMap
                  layers={mapLayers}
                  replayRecord={replayRecord}
                  compact
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 min-h-0 overflow-hidden">
              <div className="bg-white/5 rounded-lg p-3 min-h-0 overflow-hidden">
                <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
                  Corner Cause Analyzer
                </div>
                <CornerCauseCards />
              </div>
              <div className="bg-white/5 rounded-lg p-3 min-h-0 overflow-hidden">
                <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
                  Deviation from Reference Line
                </div>
                <DeviationChart />
                <div className="text-white/30 text-xs mt-1">
                  X = track position (% lap) · Y = meters from reference
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "sensors" && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 h-full min-h-0 overflow-hidden">
            <div className="space-y-3 min-h-0 overflow-hidden">
              <DataConfidenceCard />
              <SensorConsensusView />
            </div>
            <div className="bg-white/5 rounded-lg p-3 overflow-hidden min-h-0">
              <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
                Sensor Reliability
              </div>
              <SensorReliabilityPanel />
            </div>
          </div>
        )}

        {activeTab === "events" && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 h-full min-h-0 overflow-hidden">
            <div className="bg-white/5 rounded-lg p-3 min-h-0 overflow-hidden">
              <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
                Race Control
              </div>
              <RaceControlFeed />
            </div>
            <div className="bg-white/5 rounded-lg p-3 min-h-0 overflow-hidden">
              <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
                Driver Insights
              </div>
              <InsightsList />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
