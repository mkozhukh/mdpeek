import { resolve, join } from "path";
import { renderMarkdown } from "./render.js";
import { walkDir, buildNav, layout, findFirstMdFile } from "./layout.js";
import { loadSidebar, buildSidebarTree, buildLabelMap } from "./sidebar-loader.js";
import { statSync } from "fs";

export async function startServer(srcDir, port = 3000) {
  const rootDir = resolve(srcDir);
  const sidebarConfig = loadSidebar(rootDir);
  const sidebarTree = sidebarConfig ? buildSidebarTree(sidebarConfig, rootDir) : null;
  const labelMap = sidebarTree ? buildLabelMap(sidebarTree) : null;

  let server;
  let actualPort = port;

  for (let i = 0; i < 10; i++) {
    try {
      server = Bun.serve({
        port: actualPort,
        async fetch(req) {
          return handleRequest(req, rootDir, sidebarTree, labelMap);
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

async function handleRequest(req, rootDir, sidebarTree, labelMap) {
  const url = new URL(req.url);
  let pathname = decodeURIComponent(url.pathname);

  // Root redirect
  if (pathname === "/") {
    const tree = sidebarTree || walkDir(rootDir);
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
      return directoryListing(filePath, rootDir, pathname, sidebarTree, labelMap);
    }
  }

  // Markdown file rendering
  if (pathname.endsWith(".md")) {
    try {
      const md = await Bun.file(filePath).text();
      const { html: contentHtml, frontMatter } = renderMarkdown(md);
      const tree = sidebarTree || walkDir(rootDir);
      const activeFile = filePath.slice(rootDir.length + 1);
      const navHtml = buildNav(tree, activeFile);
      const page = layout(navHtml, contentHtml, activeFile, { frontMatter });
      return new Response(page, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch {
      return new Response("Error rendering file", { status: 500 });
    }
  }

  return new Response("Not found", { status: 404 });
}

function directoryListing(dirPath, rootDir, pathname, sidebarTree, labelMap) {
  const tree = sidebarTree || walkDir(rootDir);
  const entries = walkDir(rootDir, dirPath);
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

  const page = layout(navHtml, listing, "");
  return new Response(page, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
