import * as Notifications from "expo-notifications";
import type {
  Prayer,
  IqamaSchedule,
  UserPrayerPreference,
  NotificationType,
} from "@live-azan/shared";

// ─── Configuration ───────────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ─── Permissions ─────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<boolean> {
  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();

  if (existingStatus === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// ─── Schedule Helpers ────────────────────────────────────────────────────────

function parseTimeToDate(timeStr: string, baseDate?: Date): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = baseDate ? new Date(baseDate) : new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// ─── Schedule Iqama Notification ─────────────────────────────────────────────

export async function scheduleIqamaNotification(
  prayer: Prayer,
  iqamaTime: string,
  leadMinutes: number,
  mosqueName: string,
  notificationType: NotificationType
): Promise<string | undefined> {
  const iqamaDate = parseTimeToDate(iqamaTime);
  const notifyDate = new Date(iqamaDate.getTime() - leadMinutes * 60 * 1000);

  // Skip if notification time is in the past
  if (notifyDate.getTime() <= Date.now()) return undefined;

  // For MAGHRIB: if notification time would be before sunset (iqama time),
  // treat it as a departure reminder
  let title: string;
  let body: string;
  const effectiveType =
    prayer === ("MAGHRIB" as Prayer) && notificationType === ("AZAN" as NotificationType)
      ? ("DEPARTURE_REMINDER" as NotificationType)
      : notificationType;

  switch (effectiveType) {
    case "DEPARTURE_REMINDER" as NotificationType:
      title = `Time to head to ${mosqueName}`;
      body = `${formatPrayerName(prayer)} iqama in ${leadMinutes} minutes`;
      break;
    case "AZAN" as NotificationType:
      title = `${formatPrayerName(prayer)} Azan`;
      body = `Iqama at ${mosqueName} in ${leadMinutes} minutes`;
      break;
    case "SILENT_ALERT" as NotificationType:
    default:
      title = `${formatPrayerName(prayer)} Prayer`;
      body = `Iqama at ${mosqueName} in ${leadMinutes} minutes`;
      break;
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: effectiveType === ("AZAN" as NotificationType) ? "azan_default.wav" : true,
      data: { prayer, mosqueName, notificationType: effectiveType },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: notifyDate,
    },
  });

  return id;
}

// ─── Maghrib Special Handling ────────────────────────────────────────────────

export async function scheduleMaghribNotification(
  sunsetTime: string,
  leadMinutes: number,
  mosqueName: string
): Promise<void> {
  const sunsetDate = parseTimeToDate(sunsetTime);

  // PRE-SUNSET: Departure reminder
  const departureDate = new Date(
    sunsetDate.getTime() - leadMinutes * 60 * 1000
  );
  if (departureDate.getTime() > Date.now()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time to head to ${mosqueName}`,
        body: `Maghrib (sunset) in ${leadMinutes} minutes`,
        data: {
          prayer: "MAGHRIB",
          mosqueName,
          notificationType: "DEPARTURE_REMINDER",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: departureDate,
      },
    });
  }

  // AT SUNSET: Azan notification
  if (sunsetDate.getTime() > Date.now()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Maghrib Azan",
        body: `Sunset at ${mosqueName}`,
        sound: "azan_default.wav",
        data: {
          prayer: "MAGHRIB",
          mosqueName,
          notificationType: "AZAN",
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: sunsetDate,
      },
    });
  }
}

// ─── Cancel & Reschedule ─────────────────────────────────────────────────────

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function rescheduleAll(
  iqamaSchedule: IqamaSchedule[],
  prayerPrefs: UserPrayerPreference[],
  mosqueName: string
): Promise<void> {
  // Cancel existing notifications first
  await cancelAllNotifications();

  for (const iqama of iqamaSchedule) {
    const pref = prayerPrefs.find((p) => p.prayer === iqama.prayer);
    if (!pref || !pref.enabled) continue;

    if (iqama.prayer === ("MAGHRIB" as Prayer)) {
      await scheduleMaghribNotification(
        iqama.iqamaTime,
        pref.leadMinutes,
        mosqueName
      );
    } else {
      await scheduleIqamaNotification(
        iqama.prayer,
        iqama.iqamaTime,
        pref.leadMinutes,
        mosqueName,
        pref.notificationType
      );
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrayerName(prayer: Prayer): string {
  const names: Record<string, string> = {
    FAJR: "Fajr",
    DHUHR: "Dhuhr",
    ASR: "Asr",
    MAGHRIB: "Maghrib",
    ISHA: "Isha",
    JUMMAH: "Jummah",
  };
  return names[prayer] || prayer;
}
