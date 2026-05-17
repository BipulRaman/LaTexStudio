use std::path::Path;

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub severity: Severity,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub message: String,
}

// `! Some error` followed by `l.<line> ...` a few lines later.
static RE_ERROR: Lazy<Regex> = Lazy::new(|| Regex::new(r"^! (.+)$").unwrap());
static RE_LINE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^l\.(\d+)\s*(.*)$").unwrap());

// `LaTeX Warning: ... on input line N.`
static RE_LATEX_WARNING: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(?:LaTeX|Package [\w-]+) (Warning|Info|Error):\s*(.*)").unwrap());
static RE_INPUT_LINE: Lazy<Regex> = Lazy::new(|| Regex::new(r"on input line (\d+)").unwrap());

/// Parse a LaTeX `.log` file into structured diagnostics.
///
/// Best-effort — TeX log format is famously unstable; the goal is to surface
/// the most common error/warning shapes with file + line info when available.
pub fn parse(log: &str, source_path: Option<&Path>) -> Vec<Diagnostic> {
    let mut out: Vec<Diagnostic> = Vec::new();
    let mut file_stack: Vec<String> = Vec::new();
    if let Some(p) = source_path.and_then(|p| p.file_name()).and_then(|s| s.to_str()) {
        file_stack.push(p.to_string());
    }

    let lines: Vec<&str> = log.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // Track file context: `(./foo.tex` opens; `)` closes. We only track the leaf.
        for tok in line.split_whitespace() {
            if let Some(stripped) = tok.strip_prefix('(') {
                let candidate = stripped.trim_matches(|c: char| c == '(' || c == ')');
                if !candidate.is_empty()
                    && (candidate.ends_with(".tex")
                        || candidate.ends_with(".sty")
                        || candidate.ends_with(".cls"))
                {
                    file_stack.push(candidate.to_string());
                }
            }
            // Bare `)` closes one level — but the .log is messy. We don't pop
            // aggressively because doing so wrong is worse than leaving extras.
            if tok == ")" && file_stack.len() > 1 {
                file_stack.pop();
            }
        }

        // `! Foo error\n... \nl.42 ...`
        if let Some(c) = RE_ERROR.captures(line) {
            let message = c.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
            let mut found_line: Option<u32> = None;
            for j in (i + 1)..(i + 6).min(lines.len()) {
                if let Some(lc) = RE_LINE.captures(lines[j]) {
                    found_line = lc.get(1).and_then(|m| m.as_str().parse().ok());
                    break;
                }
            }
            out.push(Diagnostic {
                severity: Severity::Error,
                file: file_stack.last().cloned(),
                line: found_line,
                message: message.trim().to_string(),
            });
            i += 1;
            continue;
        }

        // `LaTeX Warning: ... on input line N.`
        if let Some(c) = RE_LATEX_WARNING.captures(line) {
            let kind = c.get(1).map(|m| m.as_str()).unwrap_or("Warning");
            let mut message = c.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
            // Some warnings wrap; collect until empty line.
            let mut j = i + 1;
            while j < lines.len() && !lines[j].trim().is_empty() && !lines[j].starts_with('!') {
                if !RE_LATEX_WARNING.is_match(lines[j]) {
                    message.push(' ');
                    message.push_str(lines[j].trim());
                    j += 1;
                } else {
                    break;
                }
            }
            let line_no = RE_INPUT_LINE
                .captures(&message)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<u32>().ok());
            let severity = match kind {
                "Error" => Severity::Error,
                "Info" => Severity::Info,
                _ => Severity::Warning,
            };
            out.push(Diagnostic {
                severity,
                file: file_stack.last().cloned(),
                line: line_no,
                message: message.trim().to_string(),
            });
            i = j;
            continue;
        }

        i += 1;
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_error() {
        let log = "(./main.tex\n! Undefined control sequence.\nl.7 \\foo\n)\n";
        let diags = parse(log, None);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].severity, Severity::Error);
        assert_eq!(diags[0].line, Some(7));
        assert!(diags[0].message.contains("Undefined"));
    }

    #[test]
    fn parses_latex_warning() {
        let log = "LaTeX Warning: Reference `foo' on input line 12 undefined.\n";
        let diags = parse(log, None);
        assert_eq!(diags.len(), 1);
        assert_eq!(diags[0].severity, Severity::Warning);
        assert_eq!(diags[0].line, Some(12));
    }
}
