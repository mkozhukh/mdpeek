#!/usr/bin/env bun

import { startServer } from "./server.js";
import { exportSite } from "./export.js";

const args = process.argv.slice(2);

let srcDir = "./";
let port = 3000;
let exportDir = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port") {
    port = parseInt(args[++i], 10);
    if (isNaN(port)) {
      console.error("Error: --port requires a number");
      process.exit(1);
    }
  } else if (args[i] === "--export") {
    exportDir = args[++i];
    if (!exportDir) {
      console.error("Error: --export requires a directory path");
      process.exit(1);
    }
  } else if (!args[i].startsWith("--")) {
    srcDir = args[i];
  }
}

if (exportDir) {
  await exportSite(srcDir, exportDir);
} else {
  await startServer(srcDir, port);
}
