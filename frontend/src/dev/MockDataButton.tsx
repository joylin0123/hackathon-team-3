import { useTelemetryStore } from '../store/telemetryStore';
import { buildMockSession } from './mockLaps';

/**
 * Dev-only — injects 7 synthesised laps directly into the Zustand store so
 * the dashboard can be demoed without Pi/AWS. Lap 7 has a severe Scheivlak
 * under-commit that drives the headline red-S2 narrative + alert.
 *
 * Gated on `import.meta.env.DEV` at the call site.
 */
export function MockDataButton() {
  const setAvailableTeams = useTelemetryStore((s) => s.setAvailableTeams);
  const setActiveTeam = useTelemetryStore((s) => s.setActiveTeam);
  const appendRecords = useTelemetryStore((s) => s.appendRecords);

  const load = () => {
    const teamId = 99;
    const records = buildMockSession(teamId);
    setAvailableTeams([teamId]);
    setActiveTeam(teamId);
    // setActiveTeam clears records, so push after.
    setTimeout(() => appendRecords(records), 0);
  };

  return (
    <button
      onClick={load}
      className="px-3 py-1.5 text-xs font-mono rounded bg-[#35fdad] text-black hover:bg-[#2de89c] transition"
    >
      Load 7 mock laps
    </button>
  );
}
