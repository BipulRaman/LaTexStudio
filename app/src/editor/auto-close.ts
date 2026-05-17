import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

type Trigger = { line: number; envName: string; insertPos: number; indent: string };

/** When the user finishes typing `\begin{env}` (closing `}`), auto-insert a
 *  matching `\end{env}` on the next line — but only if it isn't already there. */
export const autoCloseBeginEnd = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      if (!update.docChanged || update.transactions.some((tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo"))) {
        return;
      }
      // Only react when the user *just* typed `}` ending a \begin{...}.
      const triggers: Trigger[] = [];

      update.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
        if (inserted.length !== 1) return;
        if (inserted.toString() !== "}") return;
        const doc = update.state.doc;
        if (toB > doc.length) return;
        const line = doc.lineAt(toB);
        const before = line.text.slice(0, toB - line.from);
        const m = /\\begin\{([\w*-]+)\}$/.exec(before);
        if (!m) return;
        // Don't add if the next line already closes this env.
        if (line.number + 1 <= doc.lines) {
          const next = doc.line(line.number + 1);
          if (new RegExp(`^\\s*\\\\end\\{${escapeRegex(m[1])}\\}`).test(next.text)) return;
        }
        const indentMatch = /^\s*/.exec(line.text)?.[0] ?? "";
        triggers.push({
          line: line.number,
          envName: m[1],
          insertPos: line.to,
          indent: indentMatch,
        });
      });

      const t = triggers[0];
      if (t) {
        const insertText = `\n${t.indent}\t\n${t.indent}\\end{${t.envName}}`;
        // Schedule after current transaction.
        setTimeout(() => {
          const view = update.view as EditorView;
          view.dispatch({
            changes: { from: t.insertPos, insert: insertText },
            selection: { anchor: t.insertPos + 1 + t.indent.length + 1 },
            userEvent: "input.autocomplete",
          });
        }, 0);
      }
    }
  },
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
