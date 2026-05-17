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
  /** Server-side filtered listing. Pass extensions without the leading dot
   *  (e.g. `["tex", "pdf"]`). Directories are always returned regardless of
   *  the filter so the user can navigate into them. Much cheaper than
   *  `listDir` + JS-side filter when the folder contains thousands of files
   *  the UI would have thrown away. */
  listDirFiltered: (path: string, extensions: readonly string[]) =>
    call<DirEntry[]>("list_dir_filtered", { path, extensions }),
  exists: (path: string) => call<boolean>("path_exists", { path }),
  createFile: (path: string) => call<void>("create_file", { path }),
  createDir: (path: string) => call<void>("create_dir", { path }),
};
