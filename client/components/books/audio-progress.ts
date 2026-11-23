import { validBookPosition } from "../../../shared/planner/books";

export function restoredAudioSeconds(position: string | null, duration: number): number | null {
  if (!Number.isFinite(duration) || duration < 0 || (position !== null && !validBookPosition("m4b", position))) return null;
  const seconds = position === null ? 0 : Number(position);
  return seconds > 0 && seconds >= duration ? null : seconds;
}

export function audioPositionToSave(audio: { currentTime: number; ended: boolean }, restored: boolean): string | null {
  if (!restored || !Number.isFinite(audio.currentTime) || audio.currentTime < 0) return null;
  return String(audio.ended ? 0 : audio.currentTime);
}
