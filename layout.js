import { readdirSync, statSync } from "fs";
import { join, posix } from "path";

export function walkDir(rootDir, currentDir = rootDir) {
  const entries = readdirSync(currentDir);
  const items = [];

  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const fullPath = join(currentDir, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const children = walkDir(rootDir, fullPath);
      if (children.length > 0) {
        const hasIndex = children.some(
          (c) => c.type === "file" && c.name === "index.md"
        );
        items.push({ type: "dir", name, fullPath, children, hasIndex });
      }
    } else if (name.endsWith(".md")) {
      const relativePath = posix.join(
        ...fullPath.slice(rootDir.length + 1).split("/")
      );
      items.push({ type: "file", name, fullPath, relativePath });
    }
  }

  items.sort((a, b) => {
    if (a.type === "dir" && b.type !== "dir") return -1;
    if (a.type !== "dir" && b.type === "dir") return 1;
    return a.name.localeCompare(b.name);
  });

  return items;
}

export function buildNav(tree, activeFile, { relative = false } = {}) {
  let html = "<ul>";
  for (const item of tree) {
    if (item.type === "dir") {
      const label = item.name;
      if (item.hasIndex) {
        const indexChild = item.children.find(
          (c) => c.type === "file" && c.name === "index.md"
        );
        const href = linkFor(indexChild.relativePath, relative);
        html += `<li class="dir"><a href="${href}">${label}</a>`;
      } else {
        html += `<li class="dir"><span>${label}</span>`;
      }
      html += buildNav(item.children.filter(c => !(c.type === "file" && c.name === "index.md" && item.hasIndex)), activeFile, { relative });
      html += "</li>";
    } else {
      const active = item.relativePath === activeFile ? ' class="active"' : "";
      const href = linkFor(item.relativePath, relative);
      html += `<li${active}><a href="${href}">${item.name.replace(/\.md$/, "")}</a></li>`;
    }
  }
  html += "</ul>";
  return html;
}

function linkFor(relativePath, relative) {
  if (relative) {
    return "./" + relativePath.replace(/\.md$/, ".html");
  }
  return "/" + relativePath;
}

export function layout(navHtml, contentHtml, activeFile, { relative = false } = {}) {
  const title = activeFile ? activeFile.replace(/\.md$/, "") : "mdpeek";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — mdpeek</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github-dark.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      min-height: 100vh;
      color: #24292f;
      background: #fff;
    }
    nav {
      width: 260px;
      min-width: 260px;
      padding: 20px 16px;
      border-right: 1px solid #d0d7de;
      overflow-y: auto;
      background: #f6f8fa;
      font-size: 14px;
    }
    nav ul { list-style: none; }
    nav ul ul { padding-left: 16px; }
    nav li { margin: 2px 0; }
    nav li.dir > span,
    nav li.dir > a {
      font-weight: 600;
      color: #24292f;
      display: block;
      padding: 4px 8px;
      text-decoration: none;
    }
    nav li.dir > a:hover { color: #0969da; }
    nav li > a {
      display: block;
      padding: 4px 8px;
      color: #57606a;
      text-decoration: none;
      border-radius: 4px;
    }
    nav li > a:hover { color: #0969da; background: #e8ecf0; }
    nav li.active > a { color: #0969da; background: #ddf4ff; font-weight: 500; }
    main {
      flex: 1;
      padding: 40px;
      overflow-y: auto;
    }
    .content {
      max-width: 800px;
      margin: 0 auto;
      line-height: 1.7;
    }
    .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
    }
    .content h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
    .content h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
    .content p { margin: 1em 0; }
    .content a { color: #0969da; text-decoration: none; }
    .content a:hover { text-decoration: underline; }
    .content code {
      background: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 85%;
    }
    .content pre {
      background: #0d1117;
      padding: 16px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 1em 0;
    }
    .content pre code { background: none; padding: 0; color: #e6edf3; font-size: 90%; }
    .content blockquote {
      border-left: 4px solid #d0d7de;
      padding: 0.5em 1em;
      color: #57606a;
      margin: 1em 0;
    }
    .content table { border-collapse: collapse; margin: 1em 0; width: 100%; }
    .content th, .content td { border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }
    .content th { background: #f6f8fa; font-weight: 600; }
    .content ul, .content ol { padding-left: 2em; margin: 1em 0; }
    .content li { margin: 0.25em 0; }
    .content img { max-width: 100%; }
    .content hr { border: none; border-top: 1px solid #d0d7de; margin: 2em 0; }
    pre.mermaid { background: transparent; text-align: center; }
  </style>
</head>
<body>
  <nav>${navHtml}</nav>
  <main><div class="content">${contentHtml}</div></main>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true });
  </script>
</body>
</html>`;
}

export function findFirstMdFile(tree) {
  for (const item of tree) {
    if (item.type === "file") return item.relativePath;
    if (item.type === "dir") {
      const found = findFirstMdFile(item.children);
      if (found) return found;
    }
  }
  return null;
}
