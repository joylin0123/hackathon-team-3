import { create } from 'zustand';
import type { DeviationPoint, LapInfo, TelemetryRecord } from '../types/telemetry';
import { computeDeviationPoints } from '../lib/deviation';
import { computeLaps, detectLapCrossings } from '../lib/lapDetection';
import { DEFAULT_THRESHOLDS, type SectorThresholds } from '../lib/SectorEngine';
import type { NarrativeCard } from '../lib/CauseLocalizer';

const MAX_RECORDS = 3600;
const MAX_ALERTS = 50;

interface TelemetryState {
  availableTeams: number[];
  activeTeamId: number | null;
  records: TelemetryRecord[];
  latestTimestamp: number;
  isPolling: boolean;
  laps: LapInfo[];
  bestLapTimeMs: number | null;
  deviationPoints: DeviationPoint[];

  // Sector Insight Engine state
  lapCrossings: number[];
  sectorThresholds: SectorThresholds;
  alerts: NarrativeCard[];
  /** Lap numbers that have already been narrated, so we never double-alert. */
  narratedLapKeys: Set<string>;

  setAvailableTeams: (teams: number[]) => void;
  setActiveTeam: (id: number) => void;
  appendRecords: (incoming: TelemetryRecord[]) => void;
  setPolling: (active: boolean) => void;
  setSectorThresholds: (t: SectorThresholds) => void;
  pushAlert: (card: NarrativeCard) => void;
  markLapNarrated: (key: string) => void;
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  availableTeams: [],
  activeTeamId: null,
  records: [],
  latestTimestamp: 0,
  isPolling: false,
  laps: [],
  bestLapTimeMs: null,
  deviationPoints: [],
  lapCrossings: [],
  sectorThresholds: DEFAULT_THRESHOLDS,
  alerts: [],
  narratedLapKeys: new Set(),

  setAvailableTeams: (teams) => set({ availableTeams: teams }),

  setActiveTeam: (id) =>
    set({
      activeTeamId: id,
      records: [],
      latestTimestamp: 0,
      laps: [],
      bestLapTimeMs: null,
      deviationPoints: [],
      lapCrossings: [],
      alerts: [],
      narratedLapKeys: new Set(),
      isPolling: true,
    }),

  appendRecords: (incoming) => {
    const existing = get().records;
    const existingTs = new Set(existing.map((r) => r.timestamp));

    const newUnique = incoming.filter((r) => !existingTs.has(r.timestamp));
    if (newUnique.length === 0) return;

    const merged = [...existing, ...newUnique].sort((a, b) => a.timestamp - b.timestamp);
    const capped = merged.length > MAX_RECORDS ? merged.slice(merged.length - MAX_RECORDS) : merged;
    const latestTimestamp = capped[capped.length - 1].timestamp;

    const crossings = detectLapCrossings(capped);
    const laps = computeLaps(capped, crossings);
    const completedLaps = laps.filter((l) => l.lapTimeMs !== null);
    const bestLapTimeMs =
      completedLaps.length > 0
        ? Math.min(...completedLaps.map((l) => l.lapTimeMs!))
        : null;

    const deviationPoints = computeDeviationPoints(capped);

    set({
      records: capped,
      latestTimestamp,
      laps,
      bestLapTimeMs,
      deviationPoints,
      lapCrossings: crossings,
    });
  },

  setPolling: (active) => set({ isPolling: active }),

  setSectorThresholds: (t) => set({ sectorThresholds: t }),

  pushAlert: (card) => {
    const next = [card, ...get().alerts].slice(0, MAX_ALERTS);
    set({ alerts: next });
    // Mirror to projector console for the demo.
    // eslint-disable-next-line no-console
    console.warn(`[ALERT] ${card.headline} — ${card.supporting}`);
  },

  markLapNarrated: (key) => {
    const next = new Set(get().narratedLapKeys);
    next.add(key);
    set({ narratedLapKeys: next });
  },
}));
