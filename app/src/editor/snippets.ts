import { snippetCompletion, type Completion } from "@codemirror/autocomplete";

/** Tabstop snippet templates. Use `#{...}` for placeholders, `#{}` for plain. */
export const baseSnippets: Completion[] = [
  snippetCompletion("\\begin{${1:env}}\n\t${2}\n\\end{${1}}", {
    label: "begin",
    detail: "environment",
    type: "snippet",
  }),
  snippetCompletion("\\begin{figure}[${1:htbp}]\n\t\\centering\n\t\\includegraphics[width=${2:0.8}\\linewidth]{${3:path}}\n\t\\caption{${4:Caption}}\n\t\\label{fig:${5:label}}\n\\end{figure}", {
    label: "figure",
    detail: "figure environment",
    type: "snippet",
  }),
  snippetCompletion("\\begin{table}[${1:htbp}]\n\t\\centering\n\t\\begin{tabular}{${2:l l}}\n\t\t${3:a} & ${4:b} \\\\\n\t\\end{tabular}\n\t\\caption{${5:Caption}}\n\t\\label{tab:${6:label}}\n\\end{table}", {
    label: "table",
    detail: "table environment",
    type: "snippet",
  }),
  snippetCompletion("\\begin{equation}\n\t${1}\n\\end{equation}", {
    label: "equation",
    detail: "equation environment",
    type: "snippet",
  }),
  snippetCompletion("\\begin{align}\n\t${1}\n\\end{align}", {
    label: "align",
    detail: "align environment",
    type: "snippet",
  }),
  snippetCompletion("\\begin{itemize}\n\t\\item ${1}\n\\end{itemize}", {
    label: "itemize",
    detail: "bulleted list",
    type: "snippet",
  }),
  snippetCompletion("\\begin{enumerate}\n\t\\item ${1}\n\\end{enumerate}", {
    label: "enumerate",
    detail: "numbered list",
    type: "snippet",
  }),
  snippetCompletion("\\section{${1:title}}", {
    label: "section",
    detail: "\\section{…}",
    type: "snippet",
  }),
  snippetCompletion("\\subsection{${1:title}}", {
    label: "subsection",
    detail: "\\subsection{…}",
    type: "snippet",
  }),
  snippetCompletion("\\textbf{${1}}", { label: "textbf", type: "snippet" }),
  snippetCompletion("\\textit{${1}}", { label: "textit", type: "snippet" }),
  snippetCompletion("\\emph{${1}}", { label: "emph", type: "snippet" }),
  snippetCompletion("\\frac{${1:num}}{${2:den}}", { label: "frac", type: "snippet" }),
  snippetCompletion("\\sqrt{${1}}", { label: "sqrt", type: "snippet" }),
  snippetCompletion("\\cite{${1:key}}", { label: "cite", type: "snippet" }),
  snippetCompletion("\\ref{${1:label}}", { label: "ref", type: "snippet" }),
  snippetCompletion("\\label{${1:label}}", { label: "label", type: "snippet" }),
];
