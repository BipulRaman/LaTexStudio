import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { call } from "./invoke";

export type FsChangeEvent = {
  root: string;
  paths: string[];
  kind: "any";
};

export const watcherApi = {
  start: (path: string) => call<void>("start_watch", { path }),
  stop: () => call<void>("stop_watch"),
  onChange(handler: (e: FsChangeEvent) => void): Promise<UnlistenFn> {
    return listen<FsChangeEvent>("fs:changed", (evt) => handler(evt.payload));
  },
};

export const workspaceApi = {
  detectRoot: (path: string) => call<string | null>("detect_root", { path }),
};
