import { resolve, join } from "path";
import { watch } from "fs";
import { renderMarkdown } from "./render.js";
import { walkDir, buildNav, layout, findFirstMdFile, DEFAULT_IGNORE } from "./layout.js";
import { loadSidebar, buildSidebarTree, buildLabelMap } from "./sidebar-loader.js";
import { statSync, readdirSync } from "fs";

export async function startServer(srcDir, port = 3000, ignore = DEFAULT_IGNORE, { watchMode = false } = {}) {
  const rootDir = resolve(srcDir);
  const sidebarConfig = loadSidebar(rootDir);
  const sidebarTree = sidebarConfig ? buildSidebarTree(sidebarConfig, rootDir) : null;
  const labelMap = sidebarTree ? buildLabelMap(sidebarTree) : null;

  const sseClients = new Set();

  if (watchMode) {
    let debounce;
    const onChange = (event, filename) => {
      if (!filename || !filename.endsWith(".md")) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        for (const client of sseClients) {
          client.enqueue("data: reload\n\n");
        }
      }, 150);
    };
    const watchDirs = collectWatchDirs(rootDir, ignore);
    for (const dir of watchDirs) {
      watch(dir, onChange);
    }
  }

  let server;
  let actualPort = port;

  for (let i = 0; i < 10; i++) {
    try {
      server = Bun.serve({
        port: actualPort,
        idleTimeout: 255,
        async fetch(req) {
          return handleRequest(req, rootDir, sidebarTree, labelMap, ignore, sseClients, watchMode);
        },
      });
      break;
    } catch (err) {
      if (i === 9) {
        console.error(
          `Could not find a free port (tried ${port}–${port + 9})`
        );
        process.exit(1);
      }
      actualPort++;
    }
  }

  const url = `http://localhost:${server.port}`;
  console.log(`mdpeek running at ${url}`);

  try {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    Bun.spawn([cmd, url]);
  } catch {}
}

async function handleRequest(req, rootDir, sidebarTree, labelMap, ignore, sseClients, watchMode) {
  const url = new URL(req.url);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/__reload") {
    let controller;
    let keepalive;
    const stream = new ReadableStream({
      start(c) {
        controller = c;
        sseClients.add(controller);
        keepalive = setInterval(() => {
          controller.enqueue(":\n\n");
        }, 30000);
      },
      cancel() {
        clearInterval(keepalive);
        sseClients.delete(controller);
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive",
      },
    });
  }

  // Root redirect
  if (pathname === "/") {
    const tree = sidebarTree || walkDir(rootDir, rootDir, ignore);
    const first = findFirstMdFile(tree);
    if (first) {
      return Response.redirect("/" + first, 302);
    }
    return new Response("No markdown files found.", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }

  // Resolve and guard against traversal
  const filePath = resolve(rootDir, "." + pathname);
  if (!filePath.startsWith(rootDir)) {
    return new Response("Forbidden", { status: 403 });
  }

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    // try adding .md extension
    if (!pathname.endsWith(".md")) {
      const mdPath = filePath + ".md";
      try {
        statSync(mdPath);
        return Response.redirect(pathname + ".md", 302);
      } catch {}
    }
    return new Response("Not found", { status: 404 });
  }

  // Directory handling
  if (stat.isDirectory()) {
    const indexPath = join(filePath, "index.md");
    try {
      statSync(indexPath);
      // Redirect to index.md inside the directory
      const mdPath = pathname.endsWith("/")
        ? pathname + "index.md"
        : pathname + "/index.md";
      return Response.redirect(mdPath, 302);
    } catch {
      // Directory listing
      return directoryListing(filePath, rootDir, pathname, sidebarTree, labelMap, ignore, watchMode);
    }
  }

  // Markdown file rendering
  if (pathname.endsWith(".md")) {
    try {
      const md = await Bun.file(filePath).text();
      const { html: contentHtml, frontMatter } = renderMarkdown(md);
      const tree = sidebarTree || walkDir(rootDir, rootDir, ignore);
      const activeFile = filePath.slice(rootDir.length + 1);
      const navHtml = buildNav(tree, activeFile);
      const page = layout(navHtml, contentHtml, activeFile, { frontMatter, watch: watchMode });
      return new Response(page, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch {
      return new Response("Error rendering file", { status: 500 });
    }
  }

  return new Response("Not found", { status: 404 });
}

function directoryListing(dirPath, rootDir, pathname, sidebarTree, labelMap, ignore, watchMode) {
  const tree = sidebarTree || walkDir(rootDir, rootDir, ignore);
  const entries = walkDir(rootDir, dirPath, ignore);
  const activeFile = "";
  const navHtml = buildNav(tree, activeFile);

  let listing = `<h1>${pathname}</h1><ul>`;
  for (const item of entries) {
    if (item.type === "file") {
      const label = (labelMap && labelMap.get(item.relativePath)) || item.name;
      listing += `<li><a href="/${item.relativePath}">${label}</a></li>`;
    } else if (item.type === "dir") {
      const dirHref = pathname.endsWith("/")
        ? pathname + item.name
        : pathname + "/" + item.name;
      const label = (labelMap && labelMap.get(item.relativePath)) || item.name;
      listing += `<li><a href="${dirHref}/">${label}/</a></li>`;
    }
  }
  listing += "</ul>";

  const page = layout(navHtml, listing, "", { watch: watchMode });
  return new Response(page, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function collectWatchDirs(dir, ignore) {
  const dirs = [dir];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    if (ignore.has(name)) continue;
    const fullPath = join(dir, name);
    try {
      if (statSync(fullPath).isDirectory()) {
        dirs.push(...collectWatchDirs(fullPath, ignore));
      }
    } catch {}
  }
  return dirs;
}
