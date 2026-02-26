import { readFileSync, existsSync, statSync } from "fs";
import { join, posix } from "path";

export function loadSidebar(rootDir) {
  const jsonPath = join(rootDir, "sidebar.json");
  if (!existsSync(jsonPath)) return null;

  try {
    return JSON.parse(readFileSync(jsonPath, "utf-8"));
  } catch (err) {
    console.warn(`Warning: failed to parse sidebar.json: ${err.message}`);
    return null;
  }
}

export function buildSidebarTree(config, rootDir) {
  let items;
  if (Array.isArray(config)) {
    items = config;
  } else if (config && typeof config === "object") {
    const keys = Object.keys(config);
    if (keys.length === 0) return [];
    items = config[keys[0]];
    if (!Array.isArray(items)) return [];
  } else {
    return [];
  }

  return convertItems(items, rootDir);
}

function convertItems(items, rootDir) {
  const result = [];
  for (const item of items) {
    const converted = convertItem(item, rootDir);
    if (converted) result.push(converted);
  }
  return result;
}

function convertItem(item, rootDir) {
  if (typeof item === "string") {
    return fileEntry(item, undefined, rootDir);
  }

  if (item && typeof item === "object") {
    if (item.type === "doc" || (!item.type && item.id)) {
      return fileEntry(item.id, item.label, rootDir);
    }

    if (item.type === "category") {
      const children = item.items ? convertItems(item.items, rootDir) : [];
      const link = item.link;
      let indexPath = undefined;
      if (link && link.type === "doc" && link.id) {
        const entry = fileEntry(link.id, undefined, rootDir);
        if (entry) indexPath = entry.relativePath;
      }
      // infer directory path from children for folder listing fallback
      const dirPath = inferDirPath(children, rootDir);
      return {
        type: "dir",
        name: item.label || "Untitled",
        label: item.label,
        children,
        hasIndex: !!indexPath,
        indexPath,
        relativePath: dirPath,
      };
    }
  }

  return null;
}

function fileEntry(id, label, rootDir) {
  const relativePath = id.endsWith(".md") ? id : id + ".md";
  const fullPath = join(rootDir, relativePath);

  if (!existsSync(fullPath)) {
    console.warn(`Warning: sidebar references missing file: ${relativePath}`);
    return null;
  }

  const parts = relativePath.split("/");
  const name = parts[parts.length - 1];

  if (!label) {
    label = extractLabel(fullPath);
  }

  return {
    type: "file",
    name,
    relativePath: posix.join(...relativePath.split("/")),
    fullPath,
    label,
  };
}

function inferDirPath(children, rootDir) {
  // find common directory prefix from file children
  const filePaths = [];
  for (const c of children) {
    if (c.type === "file" && c.relativePath) {
      const dir = c.relativePath.split("/").slice(0, -1).join("/");
      if (dir) filePaths.push(dir);
    }
  }
  if (filePaths.length === 0) return undefined;
  const candidate = filePaths[0];
  if (filePaths.every((p) => p === candidate || p.startsWith(candidate + "/"))) {
    const fullPath = join(rootDir, candidate);
    try {
      if (statSync(fullPath).isDirectory()) return candidate;
    } catch {}
  }
  return undefined;
}

function extractLabel(filePath) {
  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return undefined;
  }

  // parse frontmatter
  if (content.startsWith("---\n") || content.startsWith("---\r\n")) {
    const endMarker = content.indexOf("\n---", 3);
    if (endMarker !== -1) {
      const fmBlock = content.slice(content.indexOf("\n") + 1, endMarker);
      const fm = {};
      for (const line of fmBlock.split("\n")) {
        const match = line.match(/^(\w[\w.-]*)\s*:\s*(.*)/);
        if (match) {
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
            val = val.slice(1, -1);
          fm[match[1]] = val;
        }
      }
      if (fm.sidebar_label) return fm.sidebar_label;
      if (fm.title) return fm.title;
      content = content.slice(endMarker + 4);
    }
  }

  // first h1
  const h1Match = content.match(/^#\s+(.+)/m);
  if (h1Match) return h1Match[1].trim();

  return undefined;
}

export function buildLabelMap(tree, map = new Map()) {
  for (const item of tree) {
    if (item.type === "file" && item.label) {
      map.set(item.relativePath, item.label);
    } else if (item.type === "dir") {
      if (item.label) {
        if (item.relativePath) map.set(item.relativePath, item.label);
      }
      if (item.children) buildLabelMap(item.children, map);
    }
  }
  return map;
}

export function collectFilesFromTree(tree) {
  const files = [];
  for (const item of tree) {
    if (item.type === "file") {
      files.push(item.relativePath);
    } else if (item.type === "dir") {
      if (item.indexPath) files.push(item.indexPath);
      if (item.children) files.push(...collectFilesFromTree(item.children));
    }
  }
  return files;
}
