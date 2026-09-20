// Runs the server's tests: everything under test/ that ends in .test.ts. The shell does not expand globs on
// every platform, so the files are found here.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const found = readdirSync(join(root, "test"), { recursive: true })
  .map(String)
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => join("test", name));

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-reporter=spec", ...found], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
