import type { Tone } from "@live-azan/shared";

/**
 * How far to trust iqama times, as a colour. Green: the mosque's own reading of today.
 * Amber: worth a second look. Red: old, guessed, or a neighbouring mosque's.
 */
export const TONE_COLOR: Record<Tone, string> = {
  good: "#1B5E20",
  fair: "#8D6E00",
  caution: "#B23C00",
};
