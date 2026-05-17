import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  RefreshCw,
} from "lucide-react";
import { fsApi, type DirEntry } from "../../api/fs";
import { toast } from "../../state/toasts";

type Props = {
  root: string;
  /** Bump to force re-fetch of all expanded directories. */
  refreshToken?: number;
  onOpenFile: (path: string) => void;
  onSetRootDoc?: (path: string) => void;
  selectedPath?: string | null;
  rootDocPath?: string | null;
};

type DraftKind = "file" | "folder";
type Draft = { parent: string; kind: DraftKind };

/** File-tree filter: keep folders and the only file types the app actually
 *  handles — LaTeX sources and PDF outputs. Build byproducts (.aux, .log,
 *  .synctex.gz, …) and unrelated formats stay hidden.
 *
 *  The actual filtering is done by the Rust `list_dir_filtered` command so
 *  huge directories never serialize entries the UI would discard. Keep this
 *  list (extensions, no leading dot) in sync with anything the UI claims to
 *  understand. */
const VISIBLE_EXTENSIONS = ["tex", "ltx", "latex", "pdf"] as const;

export function Tree({
  root,
  refreshToken = 0,
  onOpenFile,
  onSetRootDoc,
  selectedPath,
  rootDocPath,
}: Props) {
  // Lifted so creating at the *root* works the same way as inside any nested
  // folder. Only one draft is allowed at a time, matching VS Code.
  const [draft, setDraft] = useState<Draft | null>(null);
  // Bumped after a successful create so the affected folder re-fetches even
  // when the global refreshToken hasn't changed.
  const [localRefresh, setLocalRefresh] = useState(0);

  const rootName = root.split(/[\\/]/).pop() || root;

  return (
    <div className="text-xs text-fg">
      {/* Root header — mirrors VS Code's Explorer header so the global
          "New File" / "New Folder" / "Refresh" actions are reachable even
          when no folder is hovered. */}
      <div className="group flex items-center gap-1 px-1 py-0.5 rounded hover:bg-bg-hover">
        <span className="truncate text-fg font-medium flex-1" title={root}>
          {rootName}
        </span>
        <TreeActions
          onNewFile={() => setDraft({ parent: root, kind: "file" })}
          onNewFolder={() => setDraft({ parent: root, kind: "folder" })}
          onRefresh={() => setLocalRefresh((n) => n + 1)}
        />
      </div>

      <TreeNode
        path={root}
        name={rootName}
        depth={0}
        startExpanded
        hideSelfRow
        refreshToken={refreshToken + localRefresh}
        onOpenFile={onOpenFile}
        onSetRootDoc={onSetRootDoc}
        selectedPath={selectedPath}
        rootDocPath={rootDocPath}
        draft={draft}
        setDraft={setDraft}
        bumpLocalRefresh={() => setLocalRefresh((n) => n + 1)}
      />
    </div>
  );
}

function TreeActions({
  onNewFile,
  onNewFolder,
  onRefresh,
}: {
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh?: () => void;
}) {
  return (
    // Always visible so the New File / New Folder / Refresh actions are
    // discoverable without hovering.
    <div className="flex items-center gap-0.5 shrink-0">
      <IconButton title="New File" onClick={onNewFile}>
        <FilePlus className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton title="New Folder" onClick={onNewFolder}>
        <FolderPlus className="h-3.5 w-3.5" />
      </IconButton>
      {onRefresh && (
        <IconButton title="Refresh" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </IconButton>
      )}
    </div>
  );
}

function IconButton({
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
      className="p-0.5 rounded text-fg-subtle hover:text-fg hover:bg-bg-elevated"
      onClick={(e) => {
        // Don't let the row's collapse/open handler also fire.
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function TreeNode({
  path,
  name,
  depth,
  startExpanded = false,
  hideSelfRow = false,
  refreshToken,
  onOpenFile,
  onSetRootDoc,
  selectedPath,
  rootDocPath,
  draft,
  setDraft,
  bumpLocalRefresh,
}: {
  path: string;
  name: string;
  depth: number;
  startExpanded?: boolean;
  /** When true, only render this node's children — used for the root, whose
   *  header is drawn separately so it can host the global action buttons. */
  hideSelfRow?: boolean;
  refreshToken: number;
  onOpenFile: (path: string) => void;
  onSetRootDoc?: (path: string) => void;
  selectedPath?: string | null;
  rootDocPath?: string | null;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  bumpLocalRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fsApi
      .listDirFiltered(path, VISIBLE_EXTENSIONS)
      .then((items) => setChildren(items))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    if (expanded && (children == null || refreshToken > 0)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, refreshToken]);

  // If a draft is being created inside this folder, force-open it so the
  // input row is actually visible.
  useEffect(() => {
    if (draft && draft.parent === path && !expanded) setExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const isDraftHere = draft?.parent === path;

  const startNew = (kind: DraftKind) => {
    setDraft({ parent: path, kind });
    setExpanded(true);
  };

  return (
    <div>
      {!hideSelfRow && (
        <div
          className="group w-full flex items-center gap-1 px-1 py-0.5 hover:bg-bg-hover rounded [content-visibility:auto] [contain-intrinsic-size:0_22px]"
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          <button
            className="flex-1 min-w-0 text-left flex items-center gap-1"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3 text-fg-subtle shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 text-fg-subtle shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-accent shrink-0" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-accent shrink-0" />
            )}
            <span className="truncate text-fg">{name}</span>
          </button>
          <TreeActions
            onNewFile={() => startNew("file")}
            onNewFolder={() => startNew("folder")}
          />
        </div>
      )}

      {expanded && (
        <div>
          {/* When the parent's own row is hidden (root case) the children
              should sit at the parent's indent, not one level deeper —
              otherwise top-level files look orphaned far from the root header. */}
          {(() => {
            const childDepth = hideSelfRow ? depth : depth + 1;
            return (
              <>
                {loading && (
                  <div className="text-fg-subtle italic" style={{ paddingLeft: 4 + childDepth * 12 }}>
                    Loading…
                  </div>
                )}
                {error && (
                  <div className="text-red-400" style={{ paddingLeft: 4 + childDepth * 12 }}>
                    {error}
                  </div>
                )}

                {isDraftHere && (
                  <DraftRow
                    parent={path}
                    kind={draft!.kind}
                    depth={childDepth}
                    existingNames={new Set((children ?? []).map((c) => c.name.toLowerCase()))}
                    onCancel={() => setDraft(null)}
                    onCreated={(newPath, kind) => {
                      setDraft(null);
                      load();
                      bumpLocalRefresh();
                      if (kind === "file") onOpenFile(newPath);
                    }}
                  />
                )}

                {children?.map((entry) =>
                  entry.isDir ? (
                    <TreeNode
                      key={entry.path}
                      path={entry.path}
                      name={entry.name}
                      depth={childDepth}
                      refreshToken={refreshToken}
                      onOpenFile={onOpenFile}
                      onSetRootDoc={onSetRootDoc}
                      selectedPath={selectedPath}
                      rootDocPath={rootDocPath}
                      draft={draft}
                      setDraft={setDraft}
                      bumpLocalRefresh={bumpLocalRefresh}
                    />
                  ) : (
                    <FileRow
                      key={entry.path}
                      entry={entry}
                      depth={childDepth}
                      onOpenFile={onOpenFile}
                      onSetRootDoc={onSetRootDoc}
                      selected={selectedPath === entry.path}
                    />
                  ),
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function DraftRow({
  parent,
  kind,
  depth,
  existingNames,
  onCancel,
  onCreated,
}: {
  parent: string;
  kind: DraftKind;
  depth: number;
  existingNames: Set<string>;
  onCancel: () => void;
  onCreated: (newPath: string, kind: DraftKind) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Block characters Windows refuses; allow Unicode otherwise.
  const INVALID = /[\\/:*?"<>|]/;

  const validate = (name: string): string | null => {
    const n = name.trim();
    if (!n) return "Name is required";
    if (n === "." || n === "..") return "Reserved name";
    if (INVALID.test(n)) return 'Cannot contain \\ / : * ? " < > |';
    if (existingNames.has(n.toLowerCase()))
      return `A file or folder '${n}' already exists`;
    return null;
  };

  const validationError = validate(value);

  const submit = async () => {
    if (busy) return;
    if (validate(value)) return; // surfaced inline; just refuse to submit
    const name = value.trim();
    // Preserve the platform separator the parent path already uses, so the
    // resulting path stays consistent (and watch / dedupe paths work).
    const sep = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
    const newPath = parent.endsWith(sep) ? parent + name : `${parent}${sep}${name}`;
    setBusy(true);
    try {
      if (kind === "folder") {
        await fsApi.createDir(newPath);
      } else {
        await fsApi.createFile(newPath);
      }
      onCreated(newPath, kind);
    } catch (e) {
      toast.error(
        `Failed to create ${kind === "folder" ? "folder" : "file"}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    } finally {
      setBusy(false);
    }
  };

  const Icon = kind === "folder" ? Folder : FileIcon;

  return (
    <div
      className="flex items-center gap-1 px-1 py-0.5 rounded"
      style={{ paddingLeft: 4 + depth * 12 + 16 }}
    >
      <Icon
        className={
          "h-3.5 w-3.5 shrink-0 " +
          (kind === "folder" ? "text-accent" : "text-fg-subtle")
        }
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={busy}
        spellCheck={false}
        autoComplete="off"
        placeholder={kind === "folder" ? "New folder name" : "filename.tex"}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          // Only auto-cancel if the user hasn't typed anything — otherwise a
          // stray click would discard their in-progress name.
          if (!value.trim()) onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className={
          "flex-1 min-w-0 bg-bg-elevated border rounded px-1 py-px text-xs text-fg outline-none " +
          (validationError && value
            ? "border-red-500/60 focus:border-red-500"
            : "border-border focus:border-accent")
        }
        title={validationError && value ? validationError : undefined}
      />
    </div>
  );
}

function FileRow({
  entry,
  depth,
  onOpenFile,
  onSetRootDoc,
  selected,
}: {
  entry: DirEntry;
  depth: number;
  onOpenFile: (path: string) => void;
  onSetRootDoc?: (path: string) => void;
  selected: boolean;
}) {
  const isTex = /\.(tex|ltx|latex)$/i.test(entry.name);
  return (
    <div
      className={
        // content-visibility / contain-intrinsic-size let the browser skip
        // layout & paint for rows that are scrolled off-screen — effectively
        // free virtualization for long flat lists of files.
        "group flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer " +
        "[content-visibility:auto] [contain-intrinsic-size:0_22px] " +
        (selected ? "bg-bg-hover text-fg" : "hover:bg-bg-hover text-fg-muted")
      }
      style={{ paddingLeft: 4 + depth * 12 + 16 /* align past chevron */ }}
      onClick={() => onOpenFile(entry.path)}
      onContextMenu={(e) => {
        if (!isTex || !onSetRootDoc) return;
        e.preventDefault();
        onSetRootDoc(entry.path);
      }}
      title={isTex ? "Right-click to set as build root" : entry.path}
    >
      <FileIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{entry.name}</span>
    </div>
  );
}
