import { useMemo } from "react";

export type OutlineEntry = {
  level: number; // 0 = part, 1 = chapter, 2 = section, 3 = subsection, 4 = subsubsection, 5 = paragraph
  title: string;
  line: number;
};

const LEVEL: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

// Standard sectioning commands.
const RE_SECTION =
  /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\{([^}]*)\}/;

// `\frametitle{...}` from beamer — treat as section-level.
const RE_FRAMETITLE = /^\s*\\frametitle\s*(?:\[[^\]]*\])?\{([^}]*)\}/;

// Custom environments commonly used as section headings, e.g. moderncv's
// `\cvsection{Title}`, the resume-style `\begin{rSection}{Title}`, etc.
//
// We match either:
//   1. A `\<word>section{Title}` or `\<word>Section{Title}` command on a line
//   2. `\begin{<word>Section}{Title}` / `\begin{<word>section}{Title}`
//      (the trailing `Section` is the convention used by resume.cls, awesome-cv
//      and similar styles).
const RE_CUSTOM_CMD =
  /^\s*\\([A-Za-z]+[Ss]ection)\s*(?:\[[^\]]*\])?\{([^}]*)\}/;
const RE_CUSTOM_ENV =
  /^\s*\\begin\{([A-Za-z]+[Ss]ection)\}\s*(?:\[[^\]]*\])?\{([^}]*)\}/;

// Magic `% Section: Foo` / `%%% Foo` style fold markers. Pragmatic fallback
// when a doc has no real headings at all.
const RE_MAGIC = /^\s*%\s*!?(?:Section|SECTION)\s*[:\-]\s*(.+)$/;

export function parseOutline(text: string): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Magic comment first — explicit > implicit.
    {
      const m = RE_MAGIC.exec(line);
      if (m) {
        out.push({ level: 2, title: m[1].trim(), line: i + 1 });
        continue;
      }
    }

    // Skip other commented-out lines.
    if (/^\s*%/.test(line)) continue;

    // Standard sectioning.
    {
      const m = RE_SECTION.exec(line);
      if (m) {
        out.push({
          level: LEVEL[m[1]] ?? 2,
          title: cleanTitle(m[2]),
          line: i + 1,
        });
        continue;
      }
    }

    // Beamer frame title.
    {
      const m = RE_FRAMETITLE.exec(line);
      if (m) {
        out.push({ level: 2, title: cleanTitle(m[1]), line: i + 1 });
        continue;
      }
    }

    // Custom `\fooSection{...}` command.
    {
      const m = RE_CUSTOM_CMD.exec(line);
      if (m) {
        out.push({ level: 2, title: cleanTitle(m[2]), line: i + 1 });
        continue;
      }
    }

    // Custom `\begin{fooSection}{...}` environment.
    {
      const m = RE_CUSTOM_ENV.exec(line);
      if (m) {
        out.push({ level: 2, title: cleanTitle(m[2]), line: i + 1 });
        continue;
      }
    }
  }
  return out;
}

function cleanTitle(s: string): string {
  return s
    .replace(/\\&/g, "&")
    .replace(/\\[a-zA-Z]+\s?/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

export function Outline({
  text,
  onJump,
}: {
  text: string;
  onJump: (line: number) => void;
}) {
  const entries = useMemo(() => parseOutline(text), [text]);

  if (entries.length === 0) {
    return (
      <div className="px-2 py-1 italic text-fg-subtle text-xs">
        No sections found
      </div>
    );
  }

  // Normalize: start indentation at the smallest level we have.
  const minLevel = Math.min(...entries.map((e) => e.level));

  return (
    <ul className="text-xs select-none">
      {entries.map((e, i) => (
        <li key={`${i}-${e.line}`}>
          <button
            type="button"
            onClick={() => onJump(e.line)}
            // Suppress the browser's default word-select on dblclick — without
            // this, a 2nd click after focus has moved to the editor starts a
            // text-selection drag in the sidebar, which makes WebView2
            // mis-repaint the sibling tab strip until the next mouse move.
            onDoubleClick={(ev) => {
              ev.preventDefault();
              onJump(e.line);
            }}
            onMouseDown={(ev) => {
              // Prevent the focused-element text selection that starts on
              // the down-stroke of the 2nd click.
              if (ev.detail > 1) ev.preventDefault();
            }}
            className="w-full text-left flex items-center gap-2 px-1 py-0.5 rounded hover:bg-bg-hover text-fg-muted hover:text-fg select-none"
            style={{ paddingLeft: 4 + (e.level - minLevel) * 10 }}
            title={`Line ${e.line}`}
          >
            <span className="text-fg-subtle text-[10px] uppercase shrink-0">
              {labelFor(e.level)}
            </span>
            <span className="truncate">{e.title || "(untitled)"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function labelFor(level: number): string {
  switch (level) {
    case 0:
      return "Pt";
    case 1:
      return "Ch";
    case 2:
      return "§";
    case 3:
      return "§§";
    case 4:
      return "§§§";
    case 5:
      return "¶";
    default:
      return "·";
  }
}
