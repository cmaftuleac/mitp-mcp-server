import { homedir } from "node:os";
import { join } from "node:path";

export interface MitpConfig {
  /** Base origin of the SysbuPro backend, e.g. https://paap.mitp.md */
  baseUrl: string;
  /** SysbuPro application id (path segment), e.g. "resident" */
  app: string;
  /** Path to the persisted browser session (Playwright storage state) */
  sessionPath: string;
  /** When true, write actions are refused */
  readOnly: boolean;
  /** Optional raw Cookie header override (bypasses the session file) */
  cookieOverride?: string;
}

function bool(v: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((v ?? "").trim());
}

export function loadConfig(): MitpConfig {
  const baseUrl = (process.env.MITP_BASE_URL || "https://paap.mitp.md").replace(/\/+$/, "");
  const app = process.env.MITP_APP || "resident";
  const sessionPath =
    process.env.MITP_SESSION_PATH || join(homedir(), ".mitp-mcp", "session.json");
  const readOnly = bool(process.env.MITP_READ_ONLY);
  const cookieOverride = process.env.MITP_COOKIE?.trim() || undefined;
  return { baseUrl, app, sessionPath, readOnly, cookieOverride };
}
