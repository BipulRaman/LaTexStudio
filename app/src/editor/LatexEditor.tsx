import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import { bracketMatching, indentUnit } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";

import { latexLanguage } from "./latex-language";
import { latexEditorTheme, latexSyntaxHighlight } from "./latex-theme";
import { latexCompletions } from "./autocomplete";
import { autoCloseBeginEnd } from "./auto-close";
import { spellcheckExtension } from "./spellcheck";

export type LatexEditorHandle = {
  /** Move caret to a 1-based line number. */
  gotoLine: (line: number) => void;
  /** Insert text at the current selection (replaces selection). */
  insert: (text: string) => void;
  /** Wrap the current selection with `before` … `after`. */
  wrapSelection: (before: string, after: string) => void;
  /** Replace the entire contents of a 1-based line. */
  replaceLine: (line: number, contents: string) => void;
  /** Focus the editor. */
  focus: () => void;
};

export type LatexEditorProps = {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  tabSize?: number;
  onSave?: () => void;
  /** Forward-SyncTeX trigger (Ctrl/Cmd+Alt+J or Ctrl+click). */
  onSyncRequest?: (line: number, column: number) => void;
  /** Spellcheck language, e.g. "en_US". Pass undefined to disable. */
  spellLang?: string;
};

export const LatexEditor = forwardRef<LatexEditorHandle, LatexEditorProps>(
  function LatexEditor(
    { value, onChange, readOnly, tabSize = 2, onSave, onSyncRequest, spellLang },
    ref,
  ) {
    const cmRef = useRef<ReactCodeMirrorRef>(null);

    const onSyncRef = useRef(onSyncRequest);
    onSyncRef.current = onSyncRequest;
    const spellLangRef = useRef(spellLang);
    spellLangRef.current = spellLang;

    const extensions = useMemo(
      () => [
        latexLanguage,
        latexEditorTheme,
        latexSyntaxHighlight,
        EditorView.lineWrapping,
        EditorState.tabSize.of(tabSize),
        indentUnit.of(" ".repeat(tabSize)),
        bracketMatching(),
        closeBrackets(),
        autoCloseBeginEnd,
        ...(spellLang ? spellcheckExtension(() => spellLangRef.current ?? "en_US") : []),
        search({ top: true }),
        autocompletion({ override: [latexCompletions], activateOnTyping: true }),
        EditorView.domEventHandlers({
          mousedown(event, view) {
            if (!(event.ctrlKey || event.metaKey)) return false;
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos == null) return false;
            const ln = view.state.doc.lineAt(pos);
            onSyncRef.current?.(ln.number, pos - ln.from);
            event.preventDefault();
            return true;
          },
        }),
        keymap.of([
          indentWithTab,
          ...searchKeymap,
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSave?.();
              return true;
            },
          },
          {
            key: "Mod-Alt-j",
            preventDefault: true,
            run: (view) => {
              const sel = view.state.selection.main;
              const ln = view.state.doc.lineAt(sel.head);
              onSyncRef.current?.(ln.number, sel.head - ln.from);
              return true;
            },
          },
        ]),
      ],
      [tabSize, onSave, spellLang],
    );

    useImperativeHandle(
      ref,
      (): LatexEditorHandle => ({
        gotoLine(line) {
          const view = cmRef.current?.view;
          if (!view) return;
          const total = view.state.doc.lines;
          const clamped = Math.max(1, Math.min(line, total));
          const pos = view.state.doc.line(clamped).from;
          // Move the cursor without using the EditorView.scrollIntoView
          // effect — that effect can call Element.scrollIntoView on the
          // editor's outer element, which in WebView2 sometimes bubbles up
          // and triggers a parent flexbox reflow that collapses the sibling
          // h-9 top bars. We scroll the editor's own .cm-scroller manually
          // on the next frame so the dispatch settles first.
          view.dispatch({ selection: { anchor: pos } });
          requestAnimationFrame(() => {
            const v = cmRef.current?.view;
            if (!v) return;
            const block = v.lineBlockAt(pos);
            const scroller = v.scrollDOM;
            const target = block.top - scroller.clientHeight / 2 + block.height / 2;
            scroller.scrollTo({ top: Math.max(0, target) });
          });
        },
        insert(text) {
          const view = cmRef.current?.view;
          if (!view) return;
          view.dispatch(view.state.replaceSelection(text));
          view.focus();
        },
        wrapSelection(before, after) {
          const view = cmRef.current?.view;
          if (!view) return;
          const sel = view.state.selection.main;
          const slice = view.state.sliceDoc(sel.from, sel.to);
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: `${before}${slice}${after}` },
            selection: { anchor: sel.from + before.length, head: sel.from + before.length + slice.length },
          });
          view.focus();
        },
        replaceLine(line, contents) {
          const view = cmRef.current?.view;
          if (!view) return;
          const total = view.state.doc.lines;
          if (line < 1 || line > total) return;
          const l = view.state.doc.line(line);
          view.dispatch({ changes: { from: l.from, to: l.to, insert: contents } });
        },
        focus() {
          cmRef.current?.view?.focus();
        },
      }),
      [],
    );

    return (
      <div className="flex-1 min-h-0 min-w-0 relative">
        <CodeMirror
          ref={cmRef}
          value={value}
          onChange={onChange}
          extensions={extensions}
          readOnly={readOnly}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            foldGutter: true,
            bracketMatching: false, // we add our own extension above
            closeBrackets: false,
            autocompletion: false,
            history: true,
            drawSelection: true,
            dropCursor: true,
            indentOnInput: true,
            syntaxHighlighting: false,
            searchKeymap: false,
          }}
          theme="none"
          style={{ position: "absolute", inset: 0 }}
        />
      </div>
    );
  },
);
