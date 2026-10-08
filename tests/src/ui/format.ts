/** 125 -> "02:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const END_REASON_LABEL = {
  time_up: 'Time up',
  player_destroyed: 'Ship destroyed',
} as const;

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}assets/png/default/${path}`;
}