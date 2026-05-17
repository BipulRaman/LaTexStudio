import { open, save } from "@tauri-apps/plugin-dialog";

export const dialogApi = {
  async openFile(): Promise<string | null> {
    const result = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "LaTeX", extensions: ["tex", "ltx", "latex"] },
        { name: "BibTeX", extensions: ["bib"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    return typeof result === "string" ? result : null;
  },

  async openFolder(): Promise<string | null> {
    const result = await open({ directory: true, multiple: false });
    return typeof result === "string" ? result : null;
  },

  async saveAs(defaultPath?: string): Promise<string | null> {
    const result = await save({
      defaultPath,
      filters: [{ name: "LaTeX", extensions: ["tex"] }],
    });
    return typeof result === "string" ? result : null;
  },
};
