export function isValidCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function hasValidGps(record: {
  latitude?: number | null;
  longitude?: number | null;
}): record is { latitude: number; longitude: number } {
  return isValidCoordinate(record.latitude) && isValidCoordinate(record.longitude);
}
