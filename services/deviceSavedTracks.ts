import * as FileSystem from "expo-file-system/legacy";
import type { Stack as StackProject } from "../components/Stack";

export type SavedTrackRecord = {
  track_id: string;
  track_artwork: string;
  project: StackProject;
};

const SAVED_TRACKS_ROOT = `${FileSystem.documentDirectory ?? ""}recordroom-saved-tracks-v1/`;
const SAVED_TRACKS_PATH = `${SAVED_TRACKS_ROOT}saved-tracks.json`;

type SavedTracksPayload = {
  savedTracks: Record<string, SavedTrackRecord>;
};

async function ensureSavedTracksDirectory() {
  await FileSystem.makeDirectoryAsync(SAVED_TRACKS_ROOT, { intermediates: true });
}

async function fileExists(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists;
}

export async function loadSavedTracks() {
  try {
    const exists = await fileExists(SAVED_TRACKS_PATH);
    if (!exists) {
      return {};
    }

    const raw = await FileSystem.readAsStringAsync(SAVED_TRACKS_PATH);
    const payload = JSON.parse(raw) as SavedTracksPayload;
    return payload.savedTracks ?? {};
  } catch {
    return {};
  }
}

export async function saveSavedTracks(savedTracks: Record<string, SavedTrackRecord>) {
  await ensureSavedTracksDirectory();
  await FileSystem.writeAsStringAsync(
    SAVED_TRACKS_PATH,
    JSON.stringify({
      savedTracks,
    })
  );
}
