import { create } from "zustand";
import type { WorkspaceIndex } from "../api/index";

type IndexState = {
  data: WorkspaceIndex;
  setIndex: (next: WorkspaceIndex) => void;
};

export const useIndex = create<IndexState>((set) => ({
  data: { labels: [], citeKeys: [], texFiles: [], bibFiles: [] },
  setIndex: (next) => set({ data: next }),
}));
