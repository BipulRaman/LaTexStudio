import { invoke } from "@tauri-apps/api/core";

export type AppErrorPayload = {
  code: string;
  message: string;
};

export class AppError extends Error {
  code: string;
  constructor(payload: AppErrorPayload) {
    super(payload.message);
    this.code = payload.code;
    this.name = "AppError";
  }
}

/** Wrap `invoke` so backend AppError shapes become real Error instances. */
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && "message" in e) {
      throw new AppError(e as AppErrorPayload);
    }
    throw e;
  }
}
