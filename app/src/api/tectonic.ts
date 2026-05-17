import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { call } from "./invoke";

export type TectonicStatus = {
  installed: boolean;
  path: string | null;
  version: string | null;
};

export type TectonicProgress = {
  phase: "resolving" | "downloading" | "extracting" | "done";
  message?: string;
  bytes?: number;
  total?: number;
};

export const tectonicApi = {
  status: () => call<TectonicStatus>("tectonic_status"),
  install: () => call<TectonicStatus>("install_tectonic"),
  onProgress(handler: (e: TectonicProgress) => void): Promise<UnlistenFn> {
    return listen<TectonicProgress>("tectonic:progress", (evt) => handler(evt.payload));
  },
};
