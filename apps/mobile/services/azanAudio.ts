import { Audio } from "expo-av";

// ─── Available Sounds ────────────────────────────────────────────────────────

export const AZAN_SOUNDS = [
  { id: "azan-default", label: "Default", file: "azan-default.wav" },
  { id: "azan-makkah", label: "Makkah", file: "azan-makkah.wav" },
  { id: "azan-madinah", label: "Madinah", file: "azan-madinah.wav" },
  { id: "azan-alaqsa", label: "Al-Aqsa", file: "azan-alaqsa.wav" },
] as const;

export type AzanSoundId = (typeof AZAN_SOUNDS)[number]["id"];

// ─── Sound Map ───────────────────────────────────────────────────────────────

// In a production app, these would be require() calls to bundled assets.
// For now, we use a placeholder approach that loads from a URI or bundled asset.
const soundAssets: Record<string, number | { uri: string }> = {
  // These would normally be:
  // "azan-default": require("../assets/sounds/azan-default.wav"),
  // For the scaffold, we use placeholder URIs
  "azan-default": { uri: "asset:///sounds/azan-default.wav" },
  "azan-makkah": { uri: "asset:///sounds/azan-makkah.wav" },
  "azan-madinah": { uri: "asset:///sounds/azan-madinah.wav" },
  "azan-alaqsa": { uri: "asset:///sounds/azan-alaqsa.wav" },
};

// ─── Player State ────────────────────────────────────────────────────────────

let currentSound: Audio.Sound | null = null;

// ─── Audio Focus ─────────────────────────────────────────────────────────────

async function configureAudioSession(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    staysActiveInBackground: true,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

// ─── Play Azan ───────────────────────────────────────────────────────────────

export async function playAzan(soundId?: string): Promise<void> {
  // Stop any currently playing azan
  await stopAzan();

  await configureAudioSession();

  const id = soundId || "azan-default";
  const source = soundAssets[id] || soundAssets["azan-default"];

  try {
    const { sound } = await Audio.Sound.createAsync(source as any, {
      shouldPlay: true,
      volume: 1.0,
    });

    currentSound = sound;

    // Clean up when playback finishes
    sound.setOnPlaybackStatusUpdate((status) => {
      if ("didJustFinish" in status && status.didJustFinish) {
        sound.unloadAsync();
        if (currentSound === sound) {
          currentSound = null;
        }
      }
    });
  } catch (error) {
    currentSound = null;
    throw error;
  }
}

// ─── Stop Azan ───────────────────────────────────────────────────────────────

export async function stopAzan(): Promise<void> {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch {
      // Sound may already be unloaded
    }
    currentSound = null;
  }
}

// ─── Check Playing State ─────────────────────────────────────────────────────

export function isPlaying(): boolean {
  return currentSound !== null;
}
