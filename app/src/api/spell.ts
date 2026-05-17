import { call } from "./invoke";

export type CheckResult = { word: string; ok: boolean };

export const spellApi = {
  available: (lang: string) => call<boolean>("spell_available", { lang }),
  check: (lang: string, words: string[]) =>
    call<CheckResult[]>("check_words", { lang, words }),
  suggest: (lang: string, word: string) =>
    call<string[]>("suggest", { lang, word }),
  add: (lang: string, word: string) =>
    call<void>("add_to_dict", { lang, word }),
};
