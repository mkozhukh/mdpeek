# mdpeek

Preview local Markdown files in the browser. Zero config.

```bash
bunx mdpeek
```

Point it at a folder of `.md` files and get a two-column doc site with syntax highlighting, Mermaid diagrams, and sidebar navigation. No build step, no config files.

## Install

```bash
# Run directly - no install needed
bunx mdpeek

# Or install globally
bun install -g mdpeek
```

Requires [Bun](https://bun.sh).

## Quick Start

```bash
# Serve the current directory on port 3000
bunx mdpeek

# Serve a specific folder
bunx mdpeek ./docs

# Use a different port
bunx mdpeek ./docs --port 4000
```

mdpeek opens your browser automatically. The sidebar shows every `.md` file in the folder tree. Click a file, read it - that's it.

## Static Export

Generate a static HTML site from your Markdown files. Useful for CI pipelines or hosting on any static file server.

```bash
# Export current directory
bunx mdpeek --export ./out

# Export a specific folder
bunx mdpeek ./docs --export ./out
```

The output mirrors your folder structure. `docs/guide/setup.md` becomes `out/guide/setup.html`. All navigation links are relative - open the files directly in a browser or serve them from anywhere.

## Features

- Sidebar nav reflecting your folder structure
- Syntax highlighting via highlight.js (server-rendered)
- Mermaid diagram support (client-side rendering)
- Directory index pages via `index.md`

## How It Works

mdpeek walks your directory on each request, renders Markdown with [marked](https://github.com/markedjs/marked), applies syntax highlighting with [highlight.js](https://highlightjs.org/), and wraps everything in a self-contained HTML page. No bundler, no framework, no client-side JS (aside from Mermaid).

## License

MIT
