import { call } from "./invoke";

export type DirEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
};

export const fsApi = {
  readFile: (path: string) => call<string>("read_file", { path }),
  writeFile: (path: string, contents: string) =>
    call<void>("write_file", { path, contents }),
  listDir: (path: string) => call<DirEntry[]>("list_dir", { path }),
  exists: (path: string) => call<boolean>("path_exists", { path }),
};
