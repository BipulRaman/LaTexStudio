import { call } from "./invoke";

export type LabelRef = { name: string; file: string; line: number };
export type CiteKey = { key: string; file: string; title?: string };

export type WorkspaceIndex = {
  labels: LabelRef[];
  citeKeys: CiteKey[];
  texFiles: string[];
  bibFiles: string[];
};

export const indexApi = {
  scan: (root: string) => call<WorkspaceIndex>("scan_workspace", { root }),
};
