export type DashboardTab = 'overview' | 'controls' | 'telemetry' | 'route' | 'sensors' | 'events';

interface DashboardTabsProps {
  activeTab: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}

const TABS: { id: DashboardTab; label: string; description: string }[] = [
  {
    id: 'overview',
    label: 'Live Overview',
    description: 'Live car position, core lap stats, speed/grip map, and current data confidence.',
  },
  {
    id: 'controls',
    label: 'Control Center',
    description: 'Demo data, session selection, replay, and map-layer controls.',
  },
  {
    id: 'telemetry',
    label: 'Telemetry',
    description: 'Time-series traces for speed, lateral G, longitudinal G, and yaw rate.',
  },
  {
    id: 'route',
    label: 'Route Analysis',
    description: 'Ideal-line deviation, likely corner causes, and race-control events.',
  },
  {
    id: 'sensors',
    label: 'Sensor Health',
    description: 'GPS/IMU trust, packet freshness, dropouts, and run comparison.',
  },
  {
    id: 'events',
    label: 'Events',
    description: 'Race-control events and driver insight summaries.',
  },
];

export function DashboardTabs({ activeTab, onChange }: DashboardTabsProps) {
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <div className="px-3 pt-2 shrink-0">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[#35fdad] text-xs font-mono uppercase tracking-widest">
            {active.label}
          </div>
          <p className="text-white/55 text-sm mt-0.5 max-w-3xl">{active.description}</p>
        </div>

        <div className="flex flex-wrap gap-1 bg-black/20 border border-white/10 rounded-lg p-1">
          {TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChange(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                  selected
                    ? 'bg-[#35fdad] text-[#003530]'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
