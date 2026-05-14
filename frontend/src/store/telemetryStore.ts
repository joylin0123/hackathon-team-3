import { create } from 'zustand';
import type { DeviationPoint, LapInfo, TelemetryRecord } from '../types/telemetry';
import { computeDeviationPoints } from '../lib/deviation';
import { computeLaps, detectLapCrossings } from '../lib/lapDetection';

const MAX_RECORDS = 3600;

interface TelemetryState {
  availableTeams: number[];
  activeTeamId: number | null;
  records: TelemetryRecord[];
  latestTimestamp: number;
  isPolling: boolean;
  laps: LapInfo[];
  bestLapTimeMs: number | null;
  deviationPoints: DeviationPoint[];

  setAvailableTeams: (teams: number[]) => void;
  setActiveTeam: (id: number) => void;
  appendRecords: (incoming: TelemetryRecord[]) => void;
  setPolling: (active: boolean) => void;
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

  setAvailableTeams: (teams) => set({ availableTeams: teams }),

  setActiveTeam: (id) =>
    set({
      activeTeamId: id,
      records: [],
      latestTimestamp: 0,
      laps: [],
      bestLapTimeMs: null,
      deviationPoints: [],
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

    set({ records: capped, latestTimestamp, laps, bestLapTimeMs, deviationPoints });
  },

  setPolling: (active) => set({ isPolling: active }),
}));
