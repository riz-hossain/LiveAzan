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
let audioSessionConfigured = false;

// ─── Audio Focus ─────────────────────────────────────────────────────────────

async function configureAudioSession(): Promise<void> {
  if (audioSessionConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    audioSessionConfigured = true;
  } catch (err) {
    // Non-fatal — log and continue; playback may still work
    console.warn("[AzanAudio] setAudioModeAsync failed:", err);
  }
}

// ─── Play Azan ───────────────────────────────────────────────────────────────

/**
 * Play an azan sound.
 * @param soundId    - The sound asset ID (defaults to "azan-default").
 * @param onFinished - Called when playback completes naturally (not on stop).
 */
export async function playAzan(
  soundId?: string,
  onFinished?: () => void
): Promise<void> {
  // Stop any currently playing azan first
  await stopAzan();

  await configureAudioSession();

  const id = soundId && soundAssets[soundId] ? soundId : "azan-default";
  const source = soundAssets[id];

  try {
    // Create sound WITHOUT shouldPlay: true so we can attach the status
    // listener before playback begins — avoids a race condition on fast devices.
    const { sound } = await Audio.Sound.createAsync(source, {
      shouldPlay: false,
      volume: 1.0,
    });

    currentSound = sound;

    // Attach listener before playing
    sound.setOnPlaybackStatusUpdate((status) => {
      if ("didJustFinish" in status && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (currentSound === sound) {
          currentSound = null;
        }
        onFinished?.();
      }
    });

    // Explicit playAsync() is more reliable than shouldPlay: true on Android
    await sound.playAsync();
  } catch (error) {
    currentSound = null;
    throw error;
  }
}

// ─── Stop Azan ───────────────────────────────────────────────────────────────

export async function stopAzan(): Promise<void> {
  if (currentSound) {
    const sound = currentSound;
    currentSound = null;
    try {
      await sound.stopAsync();
    } catch {
      // Already stopped
    }
    try {
      await sound.unloadAsync();
    } catch {
      // Already unloaded
    }
  }
}

// ─── Check Playing State ─────────────────────────────────────────────────────

export function isPlaying(): boolean {
  return currentSound !== null;
}
