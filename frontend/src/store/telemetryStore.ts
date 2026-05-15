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
  allRecords: TelemetryRecord[];
  records: TelemetryRecord[];
  selectedSessionId: number | null;
  isDemoMode: boolean;
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
  setSelectedSession: (id: number | null) => void;
  appendRecords: (incoming: TelemetryRecord[]) => void;
  replaceRecords: (records: TelemetryRecord[], options?: { demo?: boolean; activeTeamId?: number | null }) => void;
  setPolling: (active: boolean) => void;
  setSectorThresholds: (t: SectorThresholds) => void;
  pushAlert: (card: NarrativeCard) => void;
  markLapNarrated: (key: string) => void;
}

function deriveVisibleRecords(
  allRecords: TelemetryRecord[],
  selectedSessionId: number | null,
  activeTeamId: number | null,
) {
  return allRecords.filter((record) => {
    const sessionMatches = selectedSessionId === null || record.session_id === selectedSessionId;
    const teamMatches = activeTeamId === null || record.team_id === activeTeamId;
    return sessionMatches && teamMatches;
  });
}

function deriveComputedState(
  allRecords: TelemetryRecord[],
  selectedSessionId: number | null,
  activeTeamId: number | null,
) {
  const cappedAll = allRecords.length > MAX_RECORDS ? allRecords.slice(allRecords.length - MAX_RECORDS) : allRecords;
  const records = deriveVisibleRecords(cappedAll, selectedSessionId, activeTeamId);
  const latestTimestamp = cappedAll.length > 0 ? cappedAll[cappedAll.length - 1].timestamp : 0;
  const crossings = detectLapCrossings(records);
  const laps = computeLaps(records, crossings);
  const completedLaps = laps.filter((lap) => lap.lapTimeMs !== null);
  const bestLapTimeMs = completedLaps.length > 0
    ? Math.min(...completedLaps.map((lap) => lap.lapTimeMs!))
    : null;
  const deviationPoints = computeDeviationPoints(records);

  return {
    allRecords: cappedAll,
    records,
    latestTimestamp,
    laps,
    bestLapTimeMs,
    deviationPoints,
  };
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  availableTeams: [],
  activeTeamId: null,
  allRecords: [],
  records: [],
  selectedSessionId: null,
  isDemoMode: false,
  latestTimestamp: 0,
  isPolling: false,
  laps: [],
  bestLapTimeMs: null,
  deviationPoints: [],
  lapCrossings: [],
  sectorThresholds: DEFAULT_THRESHOLDS,
  alerts: [],
  narratedLapKeys: new Set(),

  setAvailableTeams: (teams) => {
    if (get().isDemoMode) return;
    set({ availableTeams: teams });
  },

  setActiveTeam: (id) => {
    if (get().isDemoMode) {
      const next = deriveComputedState(get().allRecords, get().selectedSessionId, id);
      set({ ...next, activeTeamId: id });
      return;
    }

    set({
      activeTeamId: id,
      allRecords: [],
      records: [],
      selectedSessionId: null,
      isDemoMode: false,
      latestTimestamp: 0,
      laps: [],
      bestLapTimeMs: null,
      deviationPoints: [],
      lapCrossings: [],
      alerts: [],
      narratedLapKeys: new Set(),
      isPolling: true,
    });
  },

  setSelectedSession: (id) => {
    const next = deriveComputedState(get().allRecords, id, get().activeTeamId);
    set({ ...next, selectedSessionId: id });
  },

  appendRecords: (incoming) => {
    const existing = get().allRecords;
    const existingTs = new Set(existing.map((r) => `${r.team_id}:${r.session_id}:${r.timestamp}`));

    const newUnique = incoming.filter((r) => !existingTs.has(`${r.team_id}:${r.session_id}:${r.timestamp}`));
    if (newUnique.length === 0) return;

    const merged = [...existing, ...newUnique].sort((a, b) => a.timestamp - b.timestamp);
    const next = deriveComputedState(merged, get().selectedSessionId, get().activeTeamId);

    set({ ...next, isDemoMode: false });
  },

  replaceRecords: (records, options) => {
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const teams = Array.from(new Set(sorted.map((record) => record.team_id))).sort((a, b) => a - b);
    const activeTeamId = options?.activeTeamId ?? sorted[0]?.team_id ?? get().activeTeamId;
    const next = deriveComputedState(sorted, null, activeTeamId);
    set({
      ...next,
      availableTeams: teams.length > 0 ? teams : get().availableTeams,
      activeTeamId,
      selectedSessionId: null,
      isDemoMode: options?.demo ?? false,
      isPolling: options?.demo ? false : get().isPolling,
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
