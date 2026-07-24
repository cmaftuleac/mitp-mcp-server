import type { AuthProvider } from "./auth.js";
import type { MitpConfig } from "./config.js";
import { MitpApiError, MitpAuthError } from "./errors.js";

export interface SortField {
  field: string;
  direction: "ASC" | "DESC";
}

export interface ListQuery {
  textFilter?: string;
  advancedFilter?: unknown[];
  pageSize?: number;
  pageNumber?: number;
  sortFields?: SortField[];
}

/** A SysbuPro / Spring Data page. */
export interface Page<T = unknown> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  numberOfElements: number;
  [k: string]: unknown;
}

/**
 * Thin wrapper over the SysbuPro resident API.
 *
 * Every call is `POST {baseUrl}/p/api/{app}/{entity}/{action}` with a JSON body
 * and a session cookie. The platform is metadata-driven, so a handful of generic
 * endpoints cover almost the entire surface.
 */
export class MitpClient {
  private readonly host: string;

  constructor(
    private readonly cfg: MitpConfig,
    private readonly auth: AuthProvider,
  ) {
    this.host = new URL(cfg.baseUrl).host;
  }

  /** Low-level call to any entity/action. */
  async call<T = unknown>(
    entity: string,
    action: string,
    body: Record<string, unknown> = {},
  ): Promise<T> {
    const cookie = await this.auth.cookieHeader();
    const url = `${this.cfg.baseUrl}/p/api/${this.cfg.app}/${entity}/${action}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/plain, */*",
          cookie,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new MitpApiError(
        `Network error calling ${entity}/${action}: ${(e as Error).message}`,
      );
    }

    // Session expired: SysbuPro answers with 401/403 or a redirect to MPass/login.
    if (
      res.status === 401 ||
      res.status === 403 ||
      (res.status >= 300 && res.status < 400)
    ) {
      throw new MitpAuthError(
        `Session expired or unauthorized (HTTP ${res.status}) on ${entity}/${action}. Re-run \`npm run login\`.`,
      );
    }

    const text = await res.text();
    const contentType = res.headers.get("content-type") ?? "";

    if (!contentType.includes("json")) {
      // Almost always an HTML login page served because the session lapsed.
      throw new MitpAuthError(
        `Expected JSON from ${entity}/${action} but received "${contentType || "unknown"}". ` +
          `The session likely expired — re-run \`npm run login\`.`,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new MitpApiError(
        `Invalid JSON from ${entity}/${action}`,
        res.status,
        text.slice(0, 500),
      );
    }

    if (!res.ok) {
      throw new MitpApiError(
        `API error on ${entity}/${action} (HTTP ${res.status})`,
        res.status,
        json,
      );
    }

    return json as T;
  }

  /** Current user, role, company and system formatting. */
  whoami() {
    return this.call("user", "getUserInfo");
  }

  /** All companies the user can act on behalf of. */
  companies() {
    return this.call("ipCompanyUserMapping", "getAllMyCompanies");
  }

  /** The currently-selected company record. */
  currentCompany() {
    return this.call("ipCompanyUserMapping", "getMyCompany");
  }

  /** Column/field metadata for a list. */
  listSchema(id: string) {
    return this.call("list", "read", { id });
  }

  /** Paginated data for a list id. */
  listData<T = unknown>(id: string, q: ListQuery = {}): Promise<Page<T>> {
    return this.call<Page<T>>("list", "getData", {
      id,
      textFilter: q.textFilter ?? "",
      advancedFilter: q.advancedFilter ?? [],
      pageSize: q.pageSize ?? 25,
      pageNumber: q.pageNumber ?? 0,
      sortFields: q.sortFields ?? [{ field: "_audit.dateTime", direction: "DESC" }],
    });
  }

  /** Generic `<entity>/read` for a single record/definition. */
  read(entity: string, id: string) {
    return this.call(entity, "read", { id });
  }
}
