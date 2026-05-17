import { call } from "./invoke";

export type Settings = {
  theme: "dark" | "light" | "system";
  engine: "latexmk" | "pdflatex" | "xelatex" | "lualatex" | "tectonic";
  buildOnSave: boolean;
  spellLang: string;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
};

export const settingsApi = {
  load: () => call<Settings>("load_settings"),
  save: (settings: Settings) => call<void>("save_settings", { settings }),
};
