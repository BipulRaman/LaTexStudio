import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";

/** LaTeX language support backed by CodeMirror's legacy `stex` mode.
 *  We can swap this for a Lezer grammar later without changing the editor API. */
export const latexLanguage = StreamLanguage.define(stex);
