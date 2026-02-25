import { resolve, join, dirname, relative, posix } from "path";
import { readdirSync, statSync, existsSync, mkdirSync } from "fs";
import { renderMarkdown } from "./render.js";
import { walkDir, buildNav, layout, findFirstMdFile } from "./layout.js";

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

  // Discover all .md files
  const mdFiles = collectMdFiles(rootDir);

  if (mdFiles.length === 0) {
    console.log("No markdown files found.");
    return;
  }

  const tree = walkDir(rootDir);

  for (const filePath of mdFiles) {
    const relativePath = filePath.slice(rootDir.length + 1);
    const htmlRelative = relativePath.replace(/\.md$/, ".html");
    const outPath = join(outDir, htmlRelative);

    const md = await Bun.file(filePath).text();
    const contentHtml = renderMarkdown(md);

    const relativeToRoot = calculateRelativePath(htmlRelative);
    const navHtml = buildNavRelative(tree, relativePath, relativeToRoot);
    const page = layout(navHtml, contentHtml, relativePath, { relative: true });

    mkdirSync(dirname(outPath), { recursive: true });
    await Bun.write(outPath, page);
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

function calculateRelativePath(htmlRelative) {
  const depth = htmlRelative.split("/").length - 1;
  if (depth === 0) return "./";
  return "../".repeat(depth);
}

function buildNavRelative(tree, activeFile, relativeToRoot) {
  return buildNavRecursive(tree, activeFile, relativeToRoot, "");
}

function buildNavRecursive(items, activeFile, relativeToRoot, prefix) {
  let html = "<ul>";
  for (const item of items) {
    if (item.type === "dir") {
      if (item.hasIndex) {
        const indexPath = prefix ? prefix + "/" + item.name + "/index.md" : item.name + "/index.md";
        const href = relativeToRoot + (prefix ? prefix + "/" : "") + item.name + "/index.html";
        html += `<li class="dir"><a href="${href}">${item.name}</a>`;
      } else {
        html += `<li class="dir"><span>${item.name}</span>`;
      }
      const childPrefix = prefix ? prefix + "/" + item.name : item.name;
      const filteredChildren = item.hasIndex
        ? item.children.filter(c => !(c.type === "file" && c.name === "index.md"))
        : item.children;
      html += buildNavRecursive(filteredChildren, activeFile, relativeToRoot, childPrefix);
      html += "</li>";
    } else {
      const active = item.relativePath === activeFile ? ' class="active"' : "";
      const href = relativeToRoot + item.relativePath.replace(/\.md$/, ".html");
      html += `<li${active}><a href="${href}">${item.name.replace(/\.md$/, "")}</a></li>`;
    }
  }
  html += "</ul>";
  return html;
}
