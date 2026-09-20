// Runs every *.test.ts under src/ with Node's own test runner, TypeScript loaded by tsx.
//
// A directory argument or a glob would do it on a Unix shell, but npm runs scripts
// through cmd.exe on Windows, which expands neither, so the files are found here.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const only = process.argv.slice(2);
const files = [];

(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".test.ts") && (only.length === 0 || only.some((f) => path.includes(f)))) files.push(path);
  }
})(src);

if (files.length === 0) {
  console.error("no test files found");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-reporter=spec", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
