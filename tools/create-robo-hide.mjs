import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "robo.exe");
const target = join(root, "robo_hide.exe");

if (!existsSync(source)) {
  console.error(`ROBO executable not found: ${source}`);
  process.exit(1);
}

copyFileSync(source, target);
console.log(`Created ${target}`);
