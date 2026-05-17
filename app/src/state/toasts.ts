import { create } from "zustand";

export type ToastKind = "info" | "success" | "error" | "warning";
export type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  /** ms; null = persistent until dismissed. */
  ttl: number | null;
};

type Store = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToasts = create<Store>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    const toast: Toast = { id, ...t };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (t.ttl !== null) {
      window.setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }, t.ttl);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  info: (message: string, ttl: number | null = 3500) =>
    useToasts.getState().push({ kind: "info", message, ttl }),
  success: (message: string, ttl: number | null = 3500) =>
    useToasts.getState().push({ kind: "success", message, ttl }),
  error: (message: string, ttl: number | null = 6000) =>
    useToasts.getState().push({ kind: "error", message, ttl }),
  warning: (message: string, ttl: number | null = 4500) =>
    useToasts.getState().push({ kind: "warning", message, ttl }),
};
