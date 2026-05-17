/** A larger LaTeX command list. Not exhaustive, but covers common authoring. */
export const LATEX_COMMANDS: string[] = [
  // structure
  "documentclass", "usepackage", "title", "author", "date", "maketitle",
  "tableofcontents", "listoffigures", "listoftables", "newpage", "clearpage",
  "pagebreak", "linebreak", "noindent", "indent", "vspace", "hspace", "vfill", "hfill",
  // sections
  "part", "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph",
  // text formatting
  "textbf", "textit", "emph", "underline", "texttt", "textsc", "textsf",
  "textrm", "textmd", "textnormal", "textsuperscript", "textsubscript",
  "small", "large", "Large", "LARGE", "huge", "Huge", "footnotesize", "scriptsize",
  // references / citations
  "label", "ref", "eqref", "pageref", "autoref", "nameref",
  "cite", "citep", "citet", "citeauthor", "citeyear", "nocite",
  "bibliography", "bibliographystyle",
  // figures / tables
  "includegraphics", "caption", "centering", "hline", "cline",
  "multicolumn", "multirow",
  // lists
  "item",
  // math (text)
  "frac", "tfrac", "dfrac", "sqrt", "sum", "prod", "int", "iint", "iiint",
  "oint", "lim", "limsup", "liminf", "sup", "inf", "min", "max",
  "infty", "partial", "nabla", "forall", "exists", "in", "notin",
  "subset", "supset", "subseteq", "supseteq", "cup", "cap", "setminus",
  "leq", "geq", "neq", "approx", "equiv", "sim", "propto",
  "rightarrow", "leftarrow", "leftrightarrow", "Rightarrow", "Leftarrow",
  "Leftrightarrow", "mapsto", "to",
  // greek
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta",
  "eta", "theta", "vartheta", "iota", "kappa", "lambda", "mu", "nu",
  "xi", "pi", "varpi", "rho", "varrho", "sigma", "varsigma", "tau",
  "upsilon", "phi", "varphi", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon",
  "Phi", "Psi", "Omega",
  // accents / spacing
  "quad", "qquad", "phantom", "mathbb", "mathcal", "mathfrak", "mathbf",
  "mathit", "mathrm", "mathsf", "boldsymbol",
  // misc
  "footnote", "marginpar", "input", "include", "includeonly", "verb",
  "url", "href", "today", "thispagestyle", "pagestyle",
  "begin", "end", "appendix",
];

export const LATEX_ENVIRONMENTS: string[] = [
  "document", "abstract", "figure", "figure*", "table", "table*",
  "tabular", "tabularx", "tabbing",
  "itemize", "enumerate", "description",
  "equation", "equation*", "align", "align*", "gather", "gather*",
  "multline", "multline*", "split", "cases", "matrix", "pmatrix",
  "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix",
  "verbatim", "verbatim*", "lstlisting", "minted", "alltt",
  "quote", "quotation", "verse", "center", "flushleft", "flushright",
  "minipage", "thebibliography", "proof", "theorem", "lemma", "corollary",
  "definition", "remark", "example",
];
