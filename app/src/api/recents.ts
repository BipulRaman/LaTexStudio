import { call } from "./invoke";

export type RecentItem = {
  path: string;
  kind: "file" | "workspace";
  openedAt: string;
};

export const recentsApi = {
  list: () => call<RecentItem[]>("list_recents"),
  push: (path: string, kind: RecentItem["kind"]) =>
    call<RecentItem[]>("push_recent", { path, kind }),
  clear: () => call<void>("clear_recents"),
};
