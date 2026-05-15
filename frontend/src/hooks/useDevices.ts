import { useEffect } from 'react';
import { fetchDevices } from '../lib/api';
import { useTelemetryStore } from '../store/telemetryStore';

export function useDevices() {
  const setAvailableTeams = useTelemetryStore((s) => s.setAvailableTeams);
  const setActiveTeam = useTelemetryStore((s) => s.setActiveTeam);
  const activeTeamId = useTelemetryStore((s) => s.activeTeamId);

  useEffect(() => {
    fetchDevices()
      .then((teams) => {
        setAvailableTeams(teams);
        if (teams.length > 0 && activeTeamId === null) {
          setActiveTeam(teams.includes(3) ? 3 : teams[0]);
        }
      })
      .catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
