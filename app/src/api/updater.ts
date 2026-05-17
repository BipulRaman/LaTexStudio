import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateInfo = {
  available: boolean;
  /** Version string of the available update (e.g. "0.2.0"). */
  version?: string;
  /** Release notes / body from the update manifest. */
  notes?: string;
};

/**
 * Check the configured updater endpoint for a newer release.
 * Returns `{ available: false }` if there is no update or if the check fails.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  try {
    const update = await check();
    if (update) {
      return {
        available: true,
        version: update.version,
        notes: update.body ?? undefined,
      };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

/**
 * Download + install the available update, then relaunch the app.
 * Throws if no update is available or installation fails.
 */
export async function downloadAndInstallUpdate(
  onProgress?: (downloaded: number, total?: number) => void,
): Promise<void> {
  const update = await check();
  if (!update) {
    throw new Error("No update available");
  }
  let downloaded = 0;
  let total: number | undefined;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? undefined;
        downloaded = 0;
        onProgress?.(downloaded, total);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, total);
        break;
      case "Finished":
        onProgress?.(total ?? downloaded, total);
        break;
    }
  });
  await relaunch();
}
