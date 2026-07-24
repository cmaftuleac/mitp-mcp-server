import { readFile } from "node:fs/promises";
import { MitpAuthError } from "./errors.js";

/** Supplies the Cookie header used to authenticate SysbuPro API calls. */
export interface AuthProvider {
  cookieHeader(): Promise<string>;
  describe(): string;
}

interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
}

interface StorageState {
  cookies?: PlaywrightCookie[];
}

function domainMatches(host: string, cookieDomain: string): boolean {
  const d = cookieDomain.replace(/^\./, "").toLowerCase();
  const h = host.toLowerCase();
  return h === d || h.endsWith("." + d);
}

/**
 * Reads a Playwright storage-state file (produced by `npm run login`) and
 * builds a Cookie header from the cookies scoped to the portal host.
 *
 * The MITP session cookie is HttpOnly, so it is captured by the browser's
 * storage state (not by document.cookie) — which is exactly why we persist
 * a real browser session rather than scraping JS-visible cookies.
 */
export class SessionFileAuth implements AuthProvider {
  constructor(
    private sessionPath: string,
    private host: string,
  ) {}

  describe(): string {
    return `session file ${this.sessionPath}`;
  }

  async cookieHeader(): Promise<string> {
    let raw: string;
    try {
      raw = await readFile(this.sessionPath, "utf8");
    } catch {
      throw new MitpAuthError(
        `No session found at ${this.sessionPath}. Run \`npm run login\` and complete the MPass sign-in first.`,
      );
    }

    let state: StorageState;
    try {
      state = JSON.parse(raw);
    } catch {
      throw new MitpAuthError(
        `Session file ${this.sessionPath} is not valid JSON. Re-run \`npm run login\`.`,
      );
    }

    const now = Date.now() / 1000;
    const cookies = (state.cookies ?? []).filter(
      (c) =>
        domainMatches(this.host, c.domain) &&
        (c.expires === undefined || c.expires < 0 || c.expires > now),
    );

    if (cookies.length === 0) {
      throw new MitpAuthError(
        `No valid cookies for ${this.host} in ${this.sessionPath}. Re-run \`npm run login\`.`,
      );
    }

    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }
}

/** Uses a raw Cookie header from the MITP_COOKIE env var. */
export class EnvCookieAuth implements AuthProvider {
  constructor(private cookie: string) {}

  describe(): string {
    return "MITP_COOKIE env";
  }

  async cookieHeader(): Promise<string> {
    return this.cookie;
  }
}
