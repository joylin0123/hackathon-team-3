import { buildDemoTelemetry } from '../../lib/demoTelemetry';
import { useTelemetryStore } from '../../store/telemetryStore';

export function DemoDataControls() {
  const replaceRecords = useTelemetryStore((s) => s.replaceRecords);
  const isDemoMode = useTelemetryStore((s) => s.isDemoMode);

  return (
    <div className="bg-white/5 rounded-lg p-3">
      <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest mb-2">
        Demo Data
      </div>
      <p className="text-white/45 text-xs mb-3">
        Load synthetic Zandvoort laps for demos when the car, GPS, or cloud stream is unavailable.
      </p>
      <button
        type="button"
        onClick={() => replaceRecords(buildDemoTelemetry(), { demo: true, activeTeamId: 3 })}
        className="w-full px-3 py-2 rounded bg-white/10 hover:bg-white/15 text-white text-xs font-mono border border-white/10"
      >
        {isDemoMode ? 'Reload Demo Run' : 'Load Demo Run'}
      </button>
      {isDemoMode && (
        <div className="mt-2 text-[11px] font-mono text-yellow-200">
          Demo mode active · polling paused
        </div>
      )}
    </div>
  );
}
