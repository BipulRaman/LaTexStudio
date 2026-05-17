import {
  Bold,
  Italic,
  Underline,
  Code as CodeIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Sigma,
  Square,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  BookOpen,
  Hash,
  Tag,
  Strikethrough,
  Superscript,
  Subscript,
} from "lucide-react";

import type { LatexEditorHandle } from "./LatexEditor";

/** Snippet kinds that open a picker dialog instead of inserting directly,
 *  because they need parameters from the user (URL, dimensions, etc.). */
export type SnippetKind = "link" | "image" | "table";

type Props = {
  /** Lives in `App.tsx`. Methods are called imperatively. */
  editor: React.RefObject<LatexEditorHandle | null>;
  /** True when there is no document open — the entire toolbar is hidden then. */
  disabled?: boolean;
  /** Open the parameterised snippet picker. */
  onPickSnippet: (kind: SnippetKind) => void;
};

/** Formatting / structure / math / insert toolbar shown above the LaTeX
 *  source editor. The goal is to let non-LaTeX users discover the most
 *  common commands without memorising syntax — every button shows the
 *  LaTeX it emits in its tooltip. */
export function EditorToolbar({ editor, disabled, onPickSnippet }: Props) {
  // Convenience wrappers — keep the inline arrow handlers below short. They
  // all no-op when the editor isn't mounted yet, so they're safe to wire up
  // even before the document loads.
  const wrap = (before: string, after: string) =>
    editor.current?.wrapSelection(before, after);
  const insert = (text: string) => editor.current?.insert(text);

  if (disabled) return null;

  return (
    <div
      className="border-b border-border bg-bg-elevated px-2 flex items-center gap-0.5 text-xs select-none"
      style={{ flex: "0 0 34px", height: 34 }}
      role="toolbar"
      aria-label="Formatting toolbar"
    >
      {/* Format ------------------------------------------------------------- */}
      <ToolButton
        title="Bold — \textbf{…}"
        onClick={() => wrap("\\textbf{", "}")}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Italic — \textit{…}"
        onClick={() => wrap("\\textit{", "}")}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Emphasis — \emph{…}"
        onClick={() => wrap("\\emph{", "}")}
      >
        <span className="text-[11px] italic font-semibold">e</span>
      </ToolButton>
      <ToolButton
        title="Underline — \underline{…}"
        onClick={() => wrap("\\underline{", "}")}
      >
        <Underline className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Strikethrough — \sout{…} (requires \usepackage{ulem})"
        onClick={() => wrap("\\sout{", "}")}
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Inline code — \texttt{…}"
        onClick={() => wrap("\\texttt{", "}")}
      >
        <CodeIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Superscript — ^{…}"
        onClick={() => wrap("^{", "}")}
      >
        <Superscript className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Subscript — _{…}"
        onClick={() => wrap("_{", "}")}
      >
        <Subscript className="h-3.5 w-3.5" />
      </ToolButton>

      <Separator />

      {/* Structure --------------------------------------------------------- */}
      <ToolButton
        title="Section — \section{…}"
        onClick={() => insert("\\section{Section title}\n")}
      >
        <Heading1 className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Subsection — \subsection{…}"
        onClick={() => insert("\\subsection{Subsection title}\n")}
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Subsubsection — \subsubsection{…}"
        onClick={() => insert("\\subsubsection{Subsubsection title}\n")}
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Bulleted list — itemize"
        onClick={() =>
          insert("\\begin{itemize}\n\t\\item First item\n\t\\item Second item\n\\end{itemize}\n")
        }
      >
        <List className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Numbered list — enumerate"
        onClick={() =>
          insert(
            "\\begin{enumerate}\n\t\\item First item\n\t\\item Second item\n\\end{enumerate}\n",
          )
        }
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Quote block"
        onClick={() => insert("\\begin{quote}\n\tQuoted text.\n\\end{quote}\n")}
      >
        <Quote className="h-3.5 w-3.5" />
      </ToolButton>

      <Separator />

      {/* Math -------------------------------------------------------------- */}
      <ToolButton
        title="Inline math — $…$"
        onClick={() => wrap("$", "$")}
      >
        <Sigma className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Display math — \[ … \]"
        onClick={() => wrap("\\[ ", " \\]")}
      >
        <Square className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Equation environment"
        onClick={() => insert("\\begin{equation}\n\t\n\\end{equation}\n")}
      >
        <span className="text-[11px] font-serif italic">E</span>
      </ToolButton>
      <ToolButton
        title="Fraction — \frac{num}{den}"
        onClick={() => insert("\\frac{num}{den}")}
      >
        <span className="text-[11px] font-serif">⅔</span>
      </ToolButton>

      <Separator />

      {/* Insert ------------------------------------------------------------ */}
      <ToolButton
        title="Hyperlink — \href{url}{text}"
        onClick={() => onPickSnippet("link")}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Image / figure — \includegraphics + figure environment"
        onClick={() => onPickSnippet("image")}
      >
        <ImageIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Table — tabular inside a table environment"
        onClick={() => onPickSnippet("table")}
      >
        <TableIcon className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Citation — \cite{key}"
        onClick={() => wrap("\\cite{", "}")}
      >
        <BookOpen className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Cross-reference — \ref{key}"
        onClick={() => wrap("\\ref{", "}")}
      >
        <Hash className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton
        title="Label — \label{key}"
        onClick={() => wrap("\\label{", "}")}
      >
        <Tag className="h-3.5 w-3.5" />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center w-7 h-7 rounded text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors"
      onMouseDown={(e) => {
        // Don't steal focus from the editor — wrap/insert relies on the
        // editor's current selection, which would collapse if we did.
        e.preventDefault();
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <span className="mx-1 h-4 w-px bg-border shrink-0" aria-hidden="true" />;
}
