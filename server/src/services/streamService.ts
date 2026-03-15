// HLS/WebRTC integration to be added in Phase 6

export interface StreamStatus {
  active: boolean;
  url?: string;
}

export async function getStreamStatus(
  _mosqueId: string
): Promise<StreamStatus> {
  return { active: false };
}
