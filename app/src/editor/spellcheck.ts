import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { spellApi } from "../api/spell";

/**
 * Misspelled-range tracking via a state field. The view plugin extracts
 * candidate words from the visible viewport, batches them to the backend,
 * and dispatches a `setMisspelled` effect when results arrive.
 */
const setMisspelled = StateEffect.define<{ ranges: Array<{ from: number; to: number }> }>();

const misspelledMark = Decoration.mark({ class: "cm-misspelled" });

const misspelledField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setMisspelled)) {
        const builder = new RangeSetBuilder<Decoration>();
        for (const r of e.value.ranges) {
          builder.add(r.from, r.to, misspelledMark);
        }
        value = builder.finish();
      }
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const WORD_RE = /[A-Za-z][A-Za-z'’-]{2,}/g;

// LaTeX-aware ranges we should skip:
// - line comments (`%` to end-of-line, unless escaped as `\%`)
// - command names (`\foo`, `\foo*`)
// - environment names inside \begin{...}/\end{...}
// - inline math `$...$` and display math `$$...$$`
// - environment contents for math envs (equation, align, ...)
function buildSkipMask(text: string): Uint8Array {
  const mask = new Uint8Array(text.length);
  const mark = (from: number, to: number) => {
    const a = Math.max(0, from);
    const b = Math.min(text.length, to);
    for (let i = a; i < b; i++) mask[i] = 1;
  };

  // Line comments.
  {
    const re = /(^|[^\\])(%[^\n]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length;
      mark(start, start + m[2].length);
    }
  }
  // Commands & their {arg} groups for non-text commands (label, ref, cite, …)
  {
    const cmdRe = /\\([A-Za-z@]+)\*?/g;
    let m: RegExpExecArray | null;
    while ((m = cmdRe.exec(text))) {
      mark(m.index, m.index + m[0].length);
      const name = m[1];
      if (
        name === "label" ||
        name === "ref" ||
        name === "eqref" ||
        name === "pageref" ||
        name === "autoref" ||
        name === "nameref" ||
        name === "cite" ||
        name === "citep" ||
        name === "citet" ||
        name === "nocite" ||
        name === "citeauthor" ||
        name === "citeyear" ||
        name === "includegraphics" ||
        name === "input" ||
        name === "include" ||
        name === "usepackage" ||
        name === "documentclass" ||
        name === "url" ||
        name === "href" ||
        name === "begin" ||
        name === "end" ||
        name === "bibliography" ||
        name === "bibliographystyle"
      ) {
        // Skip following `{...}` argument (best-effort, ignores nesting).
        let i = cmdRe.lastIndex;
        // Allow optional `[...]`.
        while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
        if (text[i] === "[") {
          const close = text.indexOf("]", i + 1);
          if (close > 0) i = close + 1;
        }
        while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
        if (text[i] === "{") {
          const close = text.indexOf("}", i + 1);
          if (close > 0) mark(i, close + 1);
        }
      }
    }
  }
  // Inline and display math.
  {
    const re = /\$\$([\s\S]*?)\$\$|\$([^$\n]*)\$/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      mark(m.index, m.index + m[0].length);
    }
  }
  // Math environments.
  {
    const re =
      /\\begin\{(equation|align|gather|multline|eqnarray|displaymath|math|cases|array|matrix|pmatrix|bmatrix|vmatrix|Vmatrix)\*?\}([\s\S]*?)\\end\{\1\*?\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      mark(m.index, m.index + m[0].length);
    }
  }
  // Verbatim-ish.
  {
    const re = /\\begin\{(verbatim|lstlisting|minted|alltt)\*?\}([\s\S]*?)\\end\{\1\*?\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      mark(m.index, m.index + m[0].length);
    }
  }
  return mask;
}

type Candidate = { from: number; to: number; word: string };

function extractCandidates(view: EditorView): Candidate[] {
  const out: Candidate[] = [];
  const seenPerRange = new Set<string>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    const skip = buildSkipMask(text);
    let m: RegExpExecArray | null;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      // Skip if any char in range is masked.
      let skipped = false;
      for (let i = start; i < end; i++) {
        if (skip[i]) {
          skipped = true;
          break;
        }
      }
      if (skipped) continue;
      const w = m[0];
      // Skip ALL-CAPS short tokens (likely acronyms).
      if (w.length <= 3 && w === w.toUpperCase()) continue;
      const key = `${from + start}:${w}`;
      if (seenPerRange.has(key)) continue;
      seenPerRange.add(key);
      out.push({ from: from + start, to: from + end, word: w });
    }
  }
  return out;
}

export function spellcheckExtension(getLang: () => string) {
  return [
    misspelledField,
    spellTheme,
    ViewPlugin.fromClass(
      class {
        private timer: number | null = null;
        private lastDocVersion = -1;
        constructor(public view: EditorView) {
          this.schedule(150);
        }
        update(u: ViewUpdate) {
          if (u.docChanged || u.viewportChanged) {
            this.schedule(u.docChanged ? 350 : 100);
          }
        }
        schedule(ms: number) {
          if (this.timer != null) window.clearTimeout(this.timer);
          this.timer = window.setTimeout(() => this.run(), ms);
        }
        async run() {
          const view = this.view;
          const version = view.state.doc.length;
          this.lastDocVersion = version;
          const cands = extractCandidates(view);
          if (cands.length === 0) {
            view.dispatch({ effects: setMisspelled.of({ ranges: [] }) });
            return;
          }
          // Dedup words for the backend roundtrip.
          const words = Array.from(new Set(cands.map((c) => c.word.toLowerCase())));
          let results;
          try {
            results = await spellApi.check(getLang(), words);
          } catch {
            return;
          }
          if (this.lastDocVersion !== view.state.doc.length) return;
          const bad = new Set(
            results.filter((r) => !r.ok).map((r) => r.word.toLowerCase()),
          );
          const ranges = cands
            .filter((c) => bad.has(c.word.toLowerCase()))
            .map(({ from, to }) => ({ from, to }));
          view.dispatch({ effects: setMisspelled.of({ ranges }) });
        }
        destroy() {
          if (this.timer != null) window.clearTimeout(this.timer);
        }
      },
    ),
  ];
}

const spellTheme = EditorView.baseTheme({
  ".cm-misspelled": {
    textDecoration: "underline wavy #ef4444",
    textDecorationThickness: "1.5px",
    textUnderlineOffset: "3px",
  },
});

// Re-export so other modules can use the WidgetType if they need it later.
export { WidgetType };
