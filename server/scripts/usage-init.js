// Creates the development AI usage file (server/data/usage.json, or USAGE_FILE). Safe to run again:
// it never overwrites an existing file, so usage totals can't be reset this way.
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeUsageFile } from "../usage.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.resolve(serverDir, process.env.USAGE_FILE || "data/usage.json");
const result = await initializeUsageFile(file);
console.log(result === "created" ? `Created usage file: ${path.relative(serverDir, file)}` : `Usage file already exists (left unchanged): ${path.relative(serverDir, file)}`);
