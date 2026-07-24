#!/usr/bin/env node
/**
 * Interactive login: opens a real browser at the MITP portal so you can complete
 * the MPass sign-in (which cannot be automated headlessly), then persists the
 * resulting browser session (including the HttpOnly cookie) to disk. The MCP
 * server reuses that session for subsequent API calls.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  await mkdir(dirname(cfg.sessionPath), { recursive: true });

  console.error(
    `\nOpening a browser at ${cfg.baseUrl}\n` +
      `→ Complete the MPass sign-in and select your company.\n`,
  );

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(cfg.baseUrl);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Finish as soon as EITHER we auto-detect the portal OR the user presses Enter.
  const autoDetect = page
    .waitForURL(/\/p\/(resident|web)/, { timeout: 5 * 60 * 1000 })
    .then(() => "auto" as const)
    .catch(() => null);

  const manual = rl
    .question("Press ENTER here once you are logged in and see the portal… ")
    .then(() => "manual" as const);

  await Promise.race([autoDetect, manual]);
  rl.close();

  await context.storageState({ path: cfg.sessionPath });
  console.error(`\n✓ Saved session to ${cfg.sessionPath}\nYou can close the browser now.`);

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("login failed:", err);
  process.exit(1);
});
