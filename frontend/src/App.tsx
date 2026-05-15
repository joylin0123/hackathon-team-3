import { useEffect, useMemo, useState } from 'react';
import { useDevices } from './hooks/useDevices';
import { usePollingTelemetry } from './hooks/usePollingTelemetry';
import { useLiveTelemetry } from './hooks/useLiveTelemetry';
import { useSectorEngine } from './hooks/useSectorEngine';
import { useTelemetryStore } from './store/telemetryStore';
import { RouteMap } from './components/map/RouteMap';
import { TelemetryGraphs } from './components/graphs/TelemetryGraphs';
import { SpeedChart } from './components/graphs/SpeedChart';
import type { ChartDataPoint } from './components/graphs/TelemetryGraphs';
import { SectorInsightCard } from './components/analysis/SectorInsightCard';
import { DriverStateTape } from './components/analysis/DriverStateTape';
import { LapSectorHistoryStrip } from './components/analysis/LapSectorHistoryStrip';
import { ThresholdSliders } from './components/controls/ThresholdSliders';
import { AlertsPanel } from './components/alerts/AlertsPanel';
import { useSectorAlerts } from './hooks/useSectorAlerts';
import { MockDataButton } from './dev/MockDataButton';
import { DEFAULT_MAP_LAYERS, type MapLayers } from './components/map/mapLayers';
import { MapLayerControls } from './components/map/MapLayerControls';
import { ReplayControls, type ReplayState } from './components/replay/ReplayControls';
import { SessionPicker } from './components/data/SessionPicker';
import { SensorConsensusView } from './components/analysis/SensorConsensusView';
import { CornerCauseCards } from './components/analysis/CornerCauseCards';
import { DeviationChart } from './components/analysis/DeviationChart';
import { InsightsList } from './components/analysis/InsightsList';
import { Live1Photoreal } from './components/map-pocs/Live1Photoreal';
import { Live2BroadcastSvg } from './components/map-pocs/Live2BroadcastSvg';
import { Live3DeckSatellite } from './components/map-pocs/Live3DeckSatellite';

type View = 'pitwall' | 'live' | 'engineer' | 'live-1' | 'live-2' | 'live-3';

const LIVE_SECTOR_LAYERS: MapLayers = {
  idealLine: true,
  heatmap: false,
  drivenRoute: false,
  deviation: false,
  corners: true,
  ghost: false,
  driverState: true,
};

export function App() {
  const [view, setView] = useState<View>('pitwall');
  const [mapLayers, setMapLayers] = useState<MapLayers>(DEFAULT_MAP_LAYERS);
  const [replay, setReplay] = useState<ReplayState>({
    enabled: false,
    playing: false,
    index: 0,
    speed: 2,
  });

  useDevices();
  usePollingTelemetry(); // 5 s Athena backfill — laps, history, baselines
  useLiveTelemetry();    // 1 s DynamoDB fast path — keeps the tape's "now" cell honest
  useSectorAlerts();

  const engine = useSectorEngine();
  const laps = engine.lapStates();
  const currentLap = laps.length > 0 ? laps[laps.length - 1].lapNumber : 0;

  const records = useTelemetryStore((s) => s.records);
  const speedData = useMemo<ChartDataPoint[]>(() => {
    if (records.length === 0) return [];
    const sessionStart = records[0].timestamp;
    return records.map((r) => ({
      t: Math.round((r.timestamp - sessionStart) / 1000),
      speed: Math.round((r.speed ?? 0) * 10) / 10,
      latG: Math.round(((r.acc_y ?? 0) / 9.81) * 100) / 100,
      longG: Math.round(((r.acc_x ?? 0) / 9.81) * 100) / 100,
      yawRate: Math.round((r.yaw_rate ?? 0) * 1000) / 1000,
    }));
  }, [records]);

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
            Zandvoort Pit Wall {currentLap > 0 ? `· Lap ${currentLap}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {import.meta.env.DEV && <MockDataButton />}
          <div className="flex gap-1">
            {(['pitwall', 'live', 'engineer', 'live-1', 'live-2', 'live-3'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs font-mono rounded border transition ${
                  view === v
                    ? 'bg-white/20 border-white/40 text-white'
                    : 'border-white/20 text-white/60 hover:bg-white/10'
                }`}
              >
                {v === 'pitwall'
                  ? 'Pit Wall'
                  : v === 'live'
                    ? 'Live'
                    : v === 'engineer'
                      ? 'Engineer'
                      : v === 'live-1'
                        ? 'Live-1'
                        : v === 'live-2'
                          ? 'Live-2'
                          : 'Live-3'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 p-3 min-h-0 overflow-hidden">
        {view === 'pitwall' && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3 h-full min-h-0">
            <div className="grid grid-rows-[minmax(0,1fr)_180px] gap-3 min-h-0">
              <div className="min-h-0">
                <RouteMap layers={mapLayers} replayRecord={replayRecord} />
              </div>
              <DriverStateTape />
            </div>
            <div className="flex flex-col gap-3 min-h-0 overflow-auto">
              {controls}
              <SectorInsightCard hero />
              <div className="bg-white/5 rounded-lg px-3 py-2">
                {speedData.length > 0 ? (
                  <SpeedChart data={speedData} onBrushChange={() => {}} />
                ) : (
                  <div className="h-20 flex items-center justify-center text-white/30 text-xs">
                    Waiting for telemetry…
                  </div>
                )}
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <LapSectorHistoryStrip compact />
              </div>
              <AlertsPanel maxRows={3} />
            </div>
          </div>
        )}

        {view === 'live' && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3 h-full min-h-0">
            <div className="grid grid-rows-[minmax(0,1fr)_180px] gap-3 min-h-0">
              <div className="min-h-0">
                <RouteMap layers={LIVE_SECTOR_LAYERS} replayRecord={replayRecord} />
              </div>
              <DriverStateTape />
            </div>
            <div className="flex flex-col gap-3 min-h-0 overflow-auto">
              <SectorInsightCard hero />
              <div className="bg-white/5 rounded-lg px-3 py-2">
                {speedData.length > 0 ? (
                  <SpeedChart data={speedData} onBrushChange={() => {}} />
                ) : (
                  <div className="h-20 flex items-center justify-center text-white/30 text-xs">
                    Waiting for telemetry…
                  </div>
                )}
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <LapSectorHistoryStrip compact />
              </div>
              <AlertsPanel maxRows={3} />
            </div>
          </div>
        )}

        {(view === 'live-1' || view === 'live-2' || view === 'live-3') && (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3 h-full min-h-0">
            <div className={`min-h-0 ${view === 'live-3' ? 'grid grid-rows-[minmax(0,1fr)_180px] gap-3' : ''}`}>
              <div className="min-h-0">
                {view === 'live-1' && (
                  <Live1Photoreal records={records} latest={records[records.length - 1]} replayRecord={replayRecord} />
                )}
                {view === 'live-2' && (
                  <Live2BroadcastSvg records={records} latest={records[records.length - 1]} replayRecord={replayRecord} />
                )}
                {view === 'live-3' && (
                  <Live3DeckSatellite records={records} latest={records[records.length - 1]} replayRecord={replayRecord} />
                )}
              </div>
              {view === 'live-3' && <DriverStateTape />}
            </div>
            <div className="flex flex-col gap-3 min-h-0 overflow-auto">
              <div className="text-base">
                <SectorInsightCard hero />
              </div>
              <div className="bg-white/5 rounded-lg px-4 py-3">
                {speedData.length > 0 ? (
                  <SpeedChart data={speedData} onBrushChange={() => {}} chartHeight={240} />
                ) : (
                  <div className="h-40 flex items-center justify-center text-white/30 text-xs">
                    Waiting for telemetry…
                  </div>
                )}
              </div>
              <AlertsPanel maxRows={3} />
              <div className="mt-auto">
                <ReplayControls records={records} replay={replay} onChange={setReplay} />
              </div>
            </div>
          </div>
        )}

        {view === 'engineer' && (
          <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_300px] gap-3 h-full min-h-0 overflow-hidden">
            <div className="space-y-3 min-h-0 overflow-hidden">
              <SessionPicker />
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
              <div className="bg-white/5 rounded-lg p-3 min-h-0 overflow-hidden">
                <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
                  Corner Cause Analyzer
                </div>
                <CornerCauseCards />
              </div>
            </div>
            <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
              <div className="bg-white/5 rounded-lg p-3 flex-1 overflow-hidden min-h-0">
                <TelemetryGraphs />
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
            <div className="flex flex-col gap-3 min-h-0 overflow-auto">
              <SectorInsightCard />
              <div className="bg-white/5 rounded-lg p-3">
                <ThresholdSliders />
              </div>
              <SensorConsensusView />
              <InsightsList />
              <div className="bg-white/5 rounded-lg p-3">
                <LapSectorHistoryStrip />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
