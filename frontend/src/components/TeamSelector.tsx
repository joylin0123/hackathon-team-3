import { useTelemetryStore } from '../store/telemetryStore';

export function TeamSelector() {
  const availableTeams = useTelemetryStore((s) => s.availableTeams);
  const activeTeamId = useTelemetryStore((s) => s.activeTeamId);
  const setActiveTeam = useTelemetryStore((s) => s.setActiveTeam);
  const isPolling = useTelemetryStore((s) => s.isPolling);
  const records = useTelemetryStore((s) => s.records);

  return (
    <div className="flex items-center gap-3">
      <select
        value={activeTeamId ?? ''}
        onChange={(e) => setActiveTeam(Number(e.target.value))}
        className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#35fdad]"
      >
        {availableTeams.length === 0 && (
          <option value="" disabled>Loading teams…</option>
        )}
        {availableTeams.map((t) => (
          <option key={t} value={t}>
            Team {t}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5 text-xs text-white/50">
        <span
          className={`w-2 h-2 rounded-full ${isPolling ? 'bg-[#35fdad] animate-pulse' : 'bg-white/20'}`}
        />
        {isPolling ? `Live · ${records.length} pts` : 'Paused'}
      </div>
    </div>
  );
}
