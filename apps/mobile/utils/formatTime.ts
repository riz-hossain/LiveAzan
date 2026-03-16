/**
 * Convert a 24-hour "HH:mm" string to 12-hour AM/PM format.
 * Also handles times already in "h:mm AM/PM" format (returns as-is normalised).
 * Returns "--:--" for falsy inputs.
 */
export function formatTimeAMPM(time: string | undefined | null): string {
  if (!time || time === "--:--") return "--:--";

  // Already has AM/PM suffix — just clean whitespace
  if (/[ap]m/i.test(time)) {
    const m = time.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = m[2];
      const period = m[3].toUpperCase();
      return `${h}:${min} ${period}`;
    }
  }

  const parts = time.split(":");
  if (parts.length < 2) return time;

  const hour = parseInt(parts[0], 10);
  const minute = parts[1];
  if (isNaN(hour)) return time;

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}
