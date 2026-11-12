/**
 * Verifies that every TASK_FORM_REGISTRY href resolves to a real Next.js page file.
 * Run with: npx tsx scripts/verify-registry-hrefs.ts
 */
import * as fs from "fs";
import * as path from "path";
import { TASK_FORM_REGISTRY } from "../src/lib/task-form-registry";

const APP_DIR = path.join(__dirname, "../src/app/(dashboard)");

function hrefToPageFile(href: string): string {
  // Strip query string
  const cleanPath = href.split("?")[0];
  // Convert URL path to file system path under src/app/(dashboard)
  const rel = cleanPath.startsWith("/dashboard")
    ? cleanPath.slice("/dashboard".length)
    : cleanPath;
  return path.join(APP_DIR, "dashboard", rel, "page.tsx");
}

let allPassed = true;

console.log("Checking TASK_FORM_REGISTRY hrefs:\n");

for (const [key, entry] of Object.entries(TASK_FORM_REGISTRY)) {
  const href = entry.href("test-instance-id");
  if (href === null) {
    console.log(`  ${key.padEnd(20)} href=null  (manual — no page required) ✓`);
    continue;
  }
  const pagePath = hrefToPageFile(href);
  const exists = fs.existsSync(pagePath);
  if (exists) {
    console.log(`  ${key.padEnd(20)} ${href}  ✓`);
  } else {
    console.error(`  ${key.padEnd(20)} ${href}  ✗  NOT FOUND: ${pagePath}`);
    allPassed = false;
  }
}

console.log();
if (allPassed) {
  console.log("All hrefs resolve to existing page files.");
  process.exit(0);
} else {
  console.error("One or more hrefs do not resolve to existing page files.");
  process.exit(1);
}
