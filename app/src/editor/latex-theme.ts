import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/** Syntax colors — kept consistent across light/dark; chrome uses CSS vars. */
const syntax = {
  keyword: "#c792ea",
  builtin: "#82aaff",
  string: "#3e8c3a",
  number: "#d97742",
  comment: "#8a93a6",
  meta: "#5b8def",
  emphasis: "#c98a00",
  heading: "#d6536d",
  link: "#5b8def",
  invalid: "#ef4444",
};

export const latexEditorTheme: Extension = EditorView.theme(
  {
    "&": {
      color: "rgb(var(--c-fg))",
      backgroundColor: "rgb(var(--c-bg))",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily:
        "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "13px",
      lineHeight: "1.55",
    },
    ".cm-content": {
      caretColor: "rgb(var(--c-fg))",
      padding: "10px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "rgb(var(--c-fg))",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "rgb(var(--c-accent) / 0.25)",
      },
    ".cm-activeLine": {
      backgroundColor: "rgb(var(--c-bg-hover) / 0.5)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgb(var(--c-bg-hover) / 0.6)",
      color: "rgb(var(--c-fg))",
    },
    ".cm-gutters": {
      backgroundColor: "rgb(var(--c-bg))",
      color: "rgb(var(--c-fg-subtle))",
      border: "none",
      borderRight: "1px solid rgb(var(--c-border))",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 12px 0 8px",
      minWidth: "2.5em",
    },
    ".cm-foldGutter .cm-gutterElement": {
      color: "rgb(var(--c-fg-subtle))",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "rgb(var(--c-accent) / 0.18)",
      outline: "1px solid rgb(var(--c-accent))",
    },
    ".cm-searchMatch": {
      backgroundColor: "rgba(255,203,107,0.25)",
      outline: "1px solid rgba(255,203,107,0.7)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "rgba(255,203,107,0.45)",
    },
    ".cm-panels": {
      backgroundColor: "rgb(var(--c-bg-elevated))",
      color: "rgb(var(--c-fg))",
      borderTop: "1px solid rgb(var(--c-border))",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid rgb(var(--c-border))",
    },
    ".cm-tooltip": {
      backgroundColor: "rgb(var(--c-bg-elevated))",
      color: "rgb(var(--c-fg))",
      border: "1px solid rgb(var(--c-border))",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "rgb(var(--c-bg-hover))",
      color: "rgb(var(--c-fg))",
    },
  },
  { dark: false }, // dark mode is driven by the root .dark class via CSS vars
);

export const latexHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: syntax.keyword },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: syntax.builtin },
  { tag: [t.string, t.special(t.string)], color: syntax.string },
  { tag: t.number, color: syntax.number },
  { tag: [t.comment, t.lineComment, t.blockComment], color: syntax.comment, fontStyle: "italic" },
  { tag: t.meta, color: syntax.meta },
  { tag: t.emphasis, color: syntax.emphasis, fontStyle: "italic" },
  { tag: t.strong, color: syntax.emphasis, fontWeight: "bold" },
  { tag: t.heading, color: syntax.heading, fontWeight: "bold" },
  { tag: t.link, color: syntax.link, textDecoration: "underline" },
  { tag: t.url, color: syntax.link, textDecoration: "underline" },
  { tag: t.tagName, color: syntax.keyword },
  { tag: t.attributeName, color: syntax.builtin },
  { tag: t.bracket, color: "rgb(var(--c-fg-muted))" },
  { tag: t.operator, color: "rgb(var(--c-fg-muted))" },
  { tag: t.variableName, color: "rgb(var(--c-fg))" },
  { tag: t.propertyName, color: syntax.builtin },
  { tag: t.invalid, color: syntax.invalid },
]);

export const latexSyntaxHighlight = syntaxHighlighting(latexHighlightStyle);
