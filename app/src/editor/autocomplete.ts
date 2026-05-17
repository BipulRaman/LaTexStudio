import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { useIndex } from "../state/index";
import { LATEX_COMMANDS, LATEX_ENVIRONMENTS } from "./latex-vocab";
import { baseSnippets } from "./snippets";

const commandCompletions: Completion[] = LATEX_COMMANDS.map((name) => ({
  label: `\\${name}`,
  type: "function",
  apply: `\\${name}`,
}));

const environmentCompletions: Completion[] = LATEX_ENVIRONMENTS.map((name) => ({
  label: name,
  type: "class",
  detail: "environment",
}));

export function latexCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // \cite[...]{key1, key|}  — also \citep, \citet, \citeauthor, \nocite.
  const citeMatch = /\\(?:no)?cite[a-zA-Z]*(?:\[[^\]]*\])?\{([^}]*)$/.exec(textBefore);
  if (citeMatch) {
    const partial = citeMatch[1];
    const lastComma = partial.lastIndexOf(",");
    const head = lastComma >= 0 ? partial.slice(lastComma + 1).trimStart() : partial;
    const from = context.pos - head.length;
    const index = useIndex.getState().data;
    return {
      from,
      options: index.citeKeys.map((c) => ({
        label: c.key,
        type: "variable",
        detail: c.title ?? c.file.split(/[\\/]/).pop(),
        info: c.title,
      })),
      validFor: /^[\w:.\-]*$/,
    };
  }

  // \ref{|} / \eqref{|} / \pageref{|} / \autoref{|} / \nameref{|}
  const refMatch = /\\(?:eq|page|auto|name)?ref\{([^}]*)$/.exec(textBefore);
  if (refMatch) {
    const partial = refMatch[1];
    const from = context.pos - partial.length;
    const index = useIndex.getState().data;
    return {
      from,
      options: index.labels.map((l) => ({
        label: l.name,
        type: "variable",
        detail: `${l.file.split(/[\\/]/).pop()}:${l.line}`,
      })),
      validFor: /^[\w:.\-]*$/,
    };
  }

  // \begin{|} / \end{|}
  const beginMatch = /\\(?:begin|end)\{([\w*-]*)$/.exec(textBefore);
  if (beginMatch) {
    const partial = beginMatch[1];
    return {
      from: context.pos - partial.length,
      options: environmentCompletions,
      validFor: /^[\w*-]*$/,
    };
  }

  // Backslash command: \xx
  const cmdMatch = /\\([A-Za-z@]*)$/.exec(textBefore);
  if (cmdMatch) {
    return {
      from: context.pos - cmdMatch[1].length - 1,
      options: [...commandCompletions, ...baseSnippets],
      validFor: /^\\?[A-Za-z@]*$/,
    };
  }

  return null;
}
