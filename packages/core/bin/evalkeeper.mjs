#!/usr/bin/env node
// The `evalkeeper` command: `npx evalkeeper add pages`. See --help.
import { run } from "../dist/cli/main.js";

process.exitCode = run(process.argv.slice(2), {
  cwd: process.cwd(),
  log: (line) => console.log(line),
  error: (line) => console.error(line),
});
