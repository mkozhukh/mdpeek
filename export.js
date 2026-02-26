import { resolve, join, dirname } from "path";
import { readdirSync, statSync, existsSync, mkdirSync } from "fs";
import { renderMarkdown } from "./render.js";
import { walkDir, buildNav, layout, findFirstMdFile } from "./layout.js";
import { loadSidebar, buildSidebarTree, collectFilesFromTree, buildLabelMap } from "./sidebar-loader.js";

export async function exportSite(srcDir, outDir) {
  const rootDir = resolve(srcDir);
  outDir = resolve(outDir);

  // Check if outDir exists and is non-empty
  if (existsSync(outDir)) {
    const contents = readdirSync(outDir);
    if (contents.length > 0) {
      console.error(`Error: output directory "${outDir}" exists and is not empty.`);
      process.exit(1);
    }
  }

  mkdirSync(outDir, { recursive: true });

  // Load sidebar config if available
  const sidebarConfig = loadSidebar(rootDir);
  const sidebarTree = sidebarConfig ? buildSidebarTree(sidebarConfig, rootDir) : null;

  // Discover files: use sidebar tree if available, otherwise filesystem walk
  let mdFiles;
  if (sidebarTree) {
    mdFiles = collectFilesFromTree(sidebarTree).map(rel => join(rootDir, rel));
  } else {
    mdFiles = collectMdFiles(rootDir);
  }

  if (mdFiles.length === 0) {
    console.log("No markdown files found.");
    return;
  }

  const tree = sidebarTree || walkDir(rootDir);
  const labelMap = sidebarTree ? buildLabelMap(sidebarTree) : null;
  const dirPaths = collectDirPaths(tree, rootDir);

  for (const filePath of mdFiles) {
    const relativePath = filePath.slice(rootDir.length + 1);
    const htmlRelative = relativePath.replace(/\.md$/, ".html");
    const outPath = join(outDir, htmlRelative);

    const md = await Bun.file(filePath).text();
    const { html: rawContentHtml, frontMatter } = renderMarkdown(md);

    const relativeToRoot = calculateRelativePath(htmlRelative);
    const contentHtml = rewriteContentLinks(rawContentHtml, relativeToRoot, rootDir);
    const navHtml = buildNavRelative(tree, relativePath, relativeToRoot);
    const page = layout(navHtml, contentHtml, relativePath, { relative: true, frontMatter });

    mkdirSync(dirname(outPath), { recursive: true });
    await Bun.write(outPath, page);
  }

  // Generate listing pages for directories without an index
  for (const dirRel of dirPaths) {
    const indexOut = join(outDir, dirRel, "index.html");
    if (existsSync(indexOut)) continue;
    const dirFull = join(rootDir, dirRel);
    if (!existsSync(dirFull)) continue;

    const entries = walkDir(rootDir, dirFull);
    const relativeToRoot = calculateRelativePath(dirRel + "/index.html");
    const navHtml = buildNavRelative(tree, "", relativeToRoot);
    let listing = `<h1>${dirRel}</h1><ul>`;
    for (const item of entries) {
      if (item.type === "file") {
        const href = relativeToRoot + item.relativePath.replace(/\.md$/, ".html");
        const label = (labelMap && labelMap.get(item.relativePath)) || item.name.replace(/\.md$/, "");
        listing += `<li><a href="${href}">${label}</a></li>`;
      } else if (item.type === "dir") {
        const label = (labelMap && labelMap.get(item.relativePath)) || item.name;
        listing += `<li><a href="${item.name}/index.html">${label}/</a></li>`;
      }
    }
    listing += "</ul>";
    const page = layout(navHtml, listing, "", { relative: true });
    mkdirSync(dirname(indexOut), { recursive: true });
    await Bun.write(indexOut, page);
  }

  // Generate root index.html redirect only if no index.md exists at root
  const hasRootIndex = mdFiles.some(
    (f) => f === join(rootDir, "index.md")
  );
  if (!hasRootIndex) {
    const first = findFirstMdFile(tree);
    if (first) {
      const redirectTarget = "./" + first.replace(/\.md$/, ".html");
      const indexHtml = `<!DOCTYPE html>
<html>
<head><meta http-equiv="refresh" content="0; url=${redirectTarget}"></head>
<body><a href="${redirectTarget}">Redirecting…</a></body>
</html>`;
      await Bun.write(join(outDir, "index.html"), indexHtml);
    }
  }

  console.log(`Exported ${mdFiles.length} file(s) to ${outDir}`);
}

function collectMdFiles(dir) {
  const files = [];
  const entries = readdirSync(dir);
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const fullPath = join(dir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectMdFiles(fullPath));
    } else if (name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function rewriteContentLinks(html, relativeToRoot, rootDir) {
  return html.replace(
    /(href|src)="((?!https?:\/\/|\/\/|#|mailto:)[^"]*?)"/g,
    (match, attr, url) => {
      if (url.startsWith("/")) {
        // absolute internal link: make relative
        let path = url.slice(1);
        if (path.endsWith("/")) {
          path += "index.html";
        } else if (path.endsWith(".md")) {
          path = path.replace(/\.md$/, ".html");
        } else if (!/\.\w+$/.test(path)) {
          // check filesystem: directory or file?
          try {
            if (statSync(join(rootDir, path)).isDirectory()) {
              path += "/index.html";
            } else {
              path += ".html";
            }
          } catch {
            path += ".html";
          }
        }
        return `${attr}="${relativeToRoot}${path}"`;
      }
      // relative .md link: convert extension
      if (url.endsWith(".md")) {
        return `${attr}="${url.replace(/\.md$/, ".html")}"`;
      }
      return match;
    }
  );
}

function collectDirPaths(tree, rootDir, set = new Set()) {
  for (const item of tree) {
    if (item.type === "dir") {
      if (item.relativePath) {
        set.add(item.relativePath);
      } else {
        // infer from file children at any depth
        const files = [];
        collectAllFiles(item.children, files);
        for (const rel of files) {
          const parts = rel.split("/");
          for (let i = 1; i < parts.length; i++) {
            set.add(parts.slice(0, i).join("/"));
          }
        }
      }
      if (item.children) collectDirPaths(item.children, rootDir, set);
    }
  }
  return set;
}

function collectAllFiles(items, out) {
  for (const item of items) {
    if (item.type === "file" && item.relativePath) out.push(item.relativePath);
    else if (item.type === "dir" && item.children) collectAllFiles(item.children, out);
  }
}

function inferDirFromChildren(children) {
  const files = [];
  collectAllFiles(children, files);
  if (files.length === 0) return undefined;
  const dirs = files.map((f) => {
    const parts = f.split("/");
    return parts.length > 1 ? parts[0] : undefined;
  }).filter(Boolean);
  if (dirs.length === 0) return undefined;
  const candidate = dirs[0];
  if (dirs.every((d) => d === candidate)) return candidate;
  return undefined;
}

function calculateRelativePath(htmlRelative) {
  const depth = htmlRelative.split("/").length - 1;
  if (depth === 0) return "./";
  return "../".repeat(depth);
}

function buildNavRelative(tree, activeFile, relativeToRoot) {
  return buildNavRecursive(tree, activeFile, relativeToRoot);
}

function buildNavRecursive(items, activeFile, relativeToRoot) {
  let html = "<ul>";
  for (const item of items) {
    if (item.type === "dir") {
      const label = item.label ?? item.name;
      // resolve category link: explicit indexPath > index.md child > dir listing
      let indexRelPath = item.indexPath;
      if (!indexRelPath && item.hasIndex) {
        const indexChild = item.children.find(
          (c) => c.type === "file" && c.name === "index.md"
        );
        if (indexChild) indexRelPath = indexChild.relativePath;
      }
      const dirPath = item.relativePath || inferDirFromChildren(item.children);
      if (indexRelPath) {
        const href = relativeToRoot + indexRelPath.replace(/\.md$/, ".html");
        html += `<li class="dir"><a href="${href}">${label}</a>`;
      } else if (dirPath) {
        const href = relativeToRoot + dirPath + "/index.html";
        html += `<li class="dir"><a href="${href}">${label}</a>`;
      } else {
        html += `<li class="dir"><span>${label}</span>`;
      }
      const skipIndex = item.hasIndex && !item.indexPath;
      const filteredChildren = item.children.filter(
        (c) => !(c.type === "file" && c.name === "index.md" && skipIndex)
      );
      html += buildNavRecursive(filteredChildren, activeFile, relativeToRoot);
      html += "</li>";
    } else {
      const active = item.relativePath === activeFile ? ' class="active"' : "";
      const href = relativeToRoot + item.relativePath.replace(/\.md$/, ".html");
      html += `<li${active}><a href="${href}">${item.label ?? item.name.replace(/\.md$/, "")}</a></li>`;
    }
  }
  html += "</ul>";
  return html;
}
