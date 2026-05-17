import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
} from "lucide-react";
import { fsApi, type DirEntry } from "../../api/fs";

type Props = {
  root: string;
  /** Bump to force re-fetch of all expanded directories. */
  refreshToken?: number;
  onOpenFile: (path: string) => void;
  onSetRootDoc?: (path: string) => void;
  selectedPath?: string | null;
  rootDocPath?: string | null;
};

export function Tree({
  root,
  refreshToken = 0,
  onOpenFile,
  onSetRootDoc,
  selectedPath,
  rootDocPath,
}: Props) {
  return (
    <div className="text-xs text-fg">
      <TreeNode
        path={root}
        name={root.split(/[\\/]/).pop() || root}
        depth={0}
        startExpanded
        refreshToken={refreshToken}
        onOpenFile={onOpenFile}
        onSetRootDoc={onSetRootDoc}
        selectedPath={selectedPath}
        rootDocPath={rootDocPath}
      />
    </div>
  );
}

function TreeNode({
  path,
  name,
  depth,
  startExpanded = false,
  refreshToken,
  onOpenFile,
  onSetRootDoc,
  selectedPath,
  rootDocPath,
}: {
  path: string;
  name: string;
  depth: number;
  startExpanded?: boolean;
  refreshToken: number;
  onOpenFile: (path: string) => void;
  onSetRootDoc?: (path: string) => void;
  selectedPath?: string | null;
  rootDocPath?: string | null;
}) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fsApi
      .listDir(path)
      .then((items) => setChildren(items))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    if (expanded && (children == null || refreshToken > 0)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, refreshToken]);

  return (
    <div>
      <button
        className="w-full text-left flex items-center gap-1 px-1 py-0.5 hover:bg-bg-hover rounded"
        style={{ paddingLeft: 4 + depth * 12 }}
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

      {expanded && (
        <div>
          {loading && (
            <div className="text-fg-subtle italic" style={{ paddingLeft: 24 + depth * 12 }}>
              Loading…
            </div>
          )}
          {error && (
            <div className="text-red-400" style={{ paddingLeft: 24 + depth * 12 }}>
              {error}
            </div>
          )}
          {children?.map((entry) =>
            entry.isDir ? (
              <TreeNode
                key={entry.path}
                path={entry.path}
                name={entry.name}
                depth={depth + 1}
                refreshToken={refreshToken}
                onOpenFile={onOpenFile}
                onSetRootDoc={onSetRootDoc}
                selectedPath={selectedPath}
                rootDocPath={rootDocPath}
              />
            ) : (
              <FileRow
                key={entry.path}
                entry={entry}
                depth={depth + 1}
                onOpenFile={onOpenFile}
                onSetRootDoc={onSetRootDoc}
                selected={selectedPath === entry.path}
                isRootDoc={rootDocPath === entry.path}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function FileRow({
  entry,
  depth,
  onOpenFile,
  onSetRootDoc,
  selected,
  isRootDoc,
}: {
  entry: DirEntry;
  depth: number;
  onOpenFile: (path: string) => void;
  onSetRootDoc?: (path: string) => void;
  selected: boolean;
  isRootDoc: boolean;
}) {
  const isTex = /\.(tex|ltx|latex)$/i.test(entry.name);
  return (
    <div
      className={
        "group flex items-center gap-1 px-1 py-0.5 rounded cursor-pointer " +
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
      {isRootDoc && (
        <span className="ml-auto text-[10px] text-accent shrink-0">root</span>
      )}
    </div>
  );
}
