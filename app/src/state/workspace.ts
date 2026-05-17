import { create } from "zustand";

export type OpenDoc = {
  path: string | null; // null = untitled
  contents: string;
  dirty: boolean;
};

type WorkspaceState = {
  rootDir: string | null;
  /** Document that should be built. Defaults to activeDoc.path; can be overridden
   *  by a `% !TEX root = ...` magic comment or the user. */
  rootDoc: string | null;
  activeDoc: OpenDoc | null;
  setRoot: (path: string | null) => void;
  setRootDoc: (path: string | null) => void;
  setDoc: (doc: OpenDoc | null) => void;
  markDirty: (dirty: boolean) => void;
  updateContents: (next: string) => void;
};

export const useWorkspace = create<WorkspaceState>((set) => ({
  rootDir: null,
  rootDoc: null,
  activeDoc: null,
  setRoot: (path) => set({ rootDir: path }),
  setRootDoc: (path) => set({ rootDoc: path }),
  setDoc: (doc) => set({ activeDoc: doc }),
  markDirty: (dirty) =>
    set((s) => (s.activeDoc ? { activeDoc: { ...s.activeDoc, dirty } } : {})),
  updateContents: (next) =>
    set((s) =>
      s.activeDoc
        ? { activeDoc: { ...s.activeDoc, contents: next, dirty: true } }
        : {},
    ),
}));
