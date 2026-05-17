import { create } from "zustand";
import type { Diagnostic } from "../api/build";

export type LogLine = { kind: "stdout" | "stderr" | "info"; text: string };

type BuildPhase = "idle" | "running" | "success" | "failed" | "cancelled";

type BuildStore = {
  phase: BuildPhase;
  jobId: string | null;
  pdfPath: string | null;
  lines: LogLine[];
  diagnostics: Diagnostic[];
  startedAt: number | null;
  finishedAt: number | null;

  start: (jobId: string, info?: string) => void;
  appendLine: (line: LogLine) => void;
  finish: (
    phase: Exclude<BuildPhase, "idle" | "running">,
    diagnostics: Diagnostic[],
    pdfPath: string | null,
  ) => void;
  /** Replace the currently displayed PDF without going through a build —
   *  used when the user clicks a .pdf file in the sidebar. */
  setPdfPath: (pdfPath: string | null) => void;
  reset: () => void;
};

const MAX_LINES = 2000;

export const useBuild = create<BuildStore>((set) => ({
  phase: "idle",
  jobId: null,
  pdfPath: null,
  lines: [],
  diagnostics: [],
  startedAt: null,
  finishedAt: null,
  start: (jobId, info) =>
    set(() => ({
      phase: "running",
      jobId,
      lines: info ? [{ kind: "info", text: info }] : [],
      diagnostics: [],
      pdfPath: null,
      startedAt: Date.now(),
      finishedAt: null,
    })),
  appendLine: (line) =>
    set((s) => {
      const next = s.lines.concat(line);
      return { lines: next.length > MAX_LINES ? next.slice(-MAX_LINES) : next };
    }),
  finish: (phase, diagnostics, pdfPath) =>
    set(() => ({ phase, diagnostics, pdfPath, finishedAt: Date.now() })),
  setPdfPath: (pdfPath) => set(() => ({ pdfPath })),
  reset: () =>
    set(() => ({
      phase: "idle",
      jobId: null,
      pdfPath: null,
      lines: [],
      diagnostics: [],
      startedAt: null,
      finishedAt: null,
    })),
}));
