export interface PrayerTimes {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  date: string;
  method: number;
}

export async function fetchPrayerTimes(
  lat: number,
  lon: number,
  date?: string,
  method: number = 2
): Promise<PrayerTimes> {
  const dateStr = date ?? formatDate(new Date());
  const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lon}&method=${method}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Aladhan API error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as {
    data: {
      timings: Record<string, string>;
      date: { readable: string; gregorian: { date: string } };
    };
  };

  const timings = json.data.timings;

  return {
    fajr: timings.Fajr,
    dhuhr: timings.Dhuhr,
    asr: timings.Asr,
    maghrib: timings.Maghrib,
    isha: timings.Isha,
    date: json.data.date.gregorian.date,
    method,
  };
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
