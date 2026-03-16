import { Audio } from "expo-av";

// ─── Available Sounds ────────────────────────────────────────────────────────

// Only sounds with actual bundled asset files are listed here.
// When new WAV files are added to apps/mobile/assets/sounds/, add
// entries below AND a corresponding require() in soundAssets.
export const AZAN_SOUNDS = [
  { id: "azan-default", label: "Default" },
  // { id: "azan-makkah",  label: "Makkah"  },  // file not yet bundled
  // { id: "azan-madinah", label: "Madinah" },  // file not yet bundled
  // { id: "azan-alaqsa",  label: "Al-Aqsa" },  // file not yet bundled
] as const;

export type AzanSoundId = (typeof AZAN_SOUNDS)[number]["id"];

// ─── Sound Map ───────────────────────────────────────────────────────────────

// Use require() so Metro bundler validates the file exists at build time
// and includes it in the app bundle. Missing files cause compile errors.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const soundAssets: Record<string, any> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  "azan-default": require("../assets/sounds/azan_default.wav"),
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
    const { sound } = await Audio.Sound.createAsync(source, {
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
