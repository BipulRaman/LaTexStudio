import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { call } from "./invoke";

export type Severity = "error" | "warning" | "info";

export type Diagnostic = {
  severity: Severity;
  file: string | null;
  line: number | null;
  message: string;
};

export type Engine = "latexmk" | "pdflatex" | "xelatex" | "lualatex" | "tectonic";

export type EngineInfo = {
  engine: Engine;
  available: boolean;
  version: string | null;
  path?: string;
};

export type BuildResult = {
  jobId: string;
  success: boolean;
  exitCode: number | null;
  pdfPath: string | null;
  outputDir: string;
  diagnostics: Diagnostic[];
  cancelled: boolean;
};

export type BuildStatus =
  | "started"
  | "stdout"
  | "stderr"
  | "cancelled"
  | "failed"
  | "succeeded";

export type BuildEvent = {
  jobId: string;
  status: BuildStatus;
  line?: string;
  exitCode?: number;
};

export const buildApi = {
  probeEngines: () => call<EngineInfo[]>("probe_engines"),
  compile: (sourcePath: string, engine?: Engine) =>
    call<BuildResult>("compile_latex", { sourcePath, engine }),
  cancel: () => call<boolean>("cancel_build"),
  current: () => call<string | null>("current_build"),
  onProgress(handler: (e: BuildEvent) => void): Promise<UnlistenFn> {
    return listen<BuildEvent>("build:progress", (evt) => handler(evt.payload));
  },
};
