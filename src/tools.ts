import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MitpClient, ListQuery } from "./client.js";
import type { MitpConfig } from "./config.js";

/** Known resident list/screen ids, discovered from the `resident` menu metadata. */
const LISTS = {
  applications: "ipResidencyApplications",
  polls: "ipVoteList",
  publications: "ipPlatformInfoItem",
  financialTransactions: "financialTransactions",
  documents: "CompanyLibrary",
  itVisa: "companyProfileItVisaConfirmation",
  mailbox: {
    inbox: "ipMessageInbox",
    sent: "ipMessageSent",
    draft: "ipMessageDraftsResident",
    all: "ipMessageAllResident",
  },
  reports: {
    periodic: "ipReportQuarterly",
    annual: "ipReportAnnual",
  },
} as const;

const pagingShape = {
  textFilter: z.string().optional().describe("Free-text search across the list."),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(200)
    .optional()
    .describe("Rows per page (default 25)."),
  pageNumber: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("0-based page index (default 0)."),
};

type Paging = { textFilter?: string; pageSize?: number; pageNumber?: number };

function paging(a: Paging): ListQuery {
  return { textFilter: a.textFilter, pageSize: a.pageSize, pageNumber: a.pageNumber };
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Read-ish action verbs allowed when MITP_READ_ONLY is set. */
function isReadAction(action: string): boolean {
  return /^(read|get|list|count|search|find|load|info|connect|export|preview)/i.test(action);
}

export function registerTools(server: McpServer, client: MitpClient, cfg: MitpConfig): void {
  // ---- Identity & context -------------------------------------------------
  server.tool(
    "mitp_whoami",
    "Get the current authenticated MITP user: name, email, role, active company and system date/number formats.",
    {},
    async () => ok(await client.whoami()),
  );

  server.tool(
    "mitp_companies",
    "List every company the current user is authorized to act on behalf of in MITP.",
    {},
    async () => ok(await client.companies()),
  );

  server.tool(
    "mitp_company_profile",
    "Get the currently-selected company's profile record (legal name, IDNO, residency status, etc.).",
    {},
    async () => ok(await client.currentCompany()),
  );

  // ---- Generic list / entity access --------------------------------------
  server.tool(
    "mitp_list",
    "Query ANY MITP list/table by its list id. Returns a paginated page { content[], totalElements, totalPages }. " +
      "Use mitp_list_schema first if you need to know the available columns/fields.",
    {
      listId: z
        .string()
        .describe(
          "List id, e.g. 'ipResidencyApplications', 'financialTransactions', 'ipMessageInbox'.",
        ),
      ...pagingShape,
      sortField: z
        .string()
        .optional()
        .describe("Field path to sort by, e.g. '_audit.dateTime'."),
      sortDirection: z.enum(["ASC", "DESC"]).optional().describe("Sort direction (default DESC)."),
      advancedFilter: z
        .array(z.any())
        .optional()
        .describe("SysbuPro advanced filter array (advanced usage)."),
    },
    async (a) =>
      ok(
        await client.listData(a.listId, {
          textFilter: a.textFilter,
          pageSize: a.pageSize,
          pageNumber: a.pageNumber,
          advancedFilter: a.advancedFilter,
          sortFields: a.sortField
            ? [{ field: a.sortField, direction: a.sortDirection ?? "DESC" }]
            : undefined,
        }),
      ),
  );

  server.tool(
    "mitp_list_schema",
    "Get the column/field metadata (definition) for a MITP list id.",
    { listId: z.string().describe("List id to describe.") },
    async (a) => ok(await client.listSchema(a.listId)),
  );

  server.tool(
    "mitp_read",
    "Read a single MITP entity/screen/menu definition by id via the generic <entity>/read endpoint.",
    {
      entity: z
        .string()
        .describe("Entity name, e.g. 'application', 'menu', 'screen', 'list'."),
      id: z.string().describe("Record/definition id."),
    },
    async (a) => ok(await client.read(a.entity, a.id)),
  );

  // ---- Curated resident domains ------------------------------------------
  server.tool(
    "mitp_applications",
    "List residency applications for the current company.",
    { ...pagingShape },
    async (a) => ok(await client.listData(LISTS.applications, paging(a))),
  );

  server.tool(
    "mitp_mailbox",
    "List messages in a mailbox folder (inbox, sent, draft or all).",
    {
      folder: z
        .enum(["inbox", "sent", "draft", "all"])
        .default("inbox")
        .describe("Mailbox folder."),
      ...pagingShape,
    },
    async (a) => ok(await client.listData(LISTS.mailbox[a.folder], paging(a))),
  );

  server.tool(
    "mitp_reports",
    "List resident reports: 'periodic' (quarterly) or 'annual' (annual verification).",
    {
      type: z.enum(["periodic", "annual"]).default("periodic").describe("Report type."),
      ...pagingShape,
    },
    async (a) => ok(await client.listData(LISTS.reports[a.type], paging(a))),
  );

  server.tool(
    "mitp_polls",
    "List polls / surveys addressed to the resident.",
    { ...pagingShape },
    async (a) => ok(await client.listData(LISTS.polls, paging(a))),
  );

  server.tool(
    "mitp_publications",
    "List MITP platform publications / announcements.",
    { ...pagingShape },
    async (a) => ok(await client.listData(LISTS.publications, paging(a))),
  );

  server.tool(
    "mitp_financial_transactions",
    "List financial transactions for the current company.",
    { ...pagingShape },
    async (a) => ok(await client.listData(LISTS.financialTransactions, paging(a))),
  );

  server.tool(
    "mitp_documents",
    "List the company document set (Biblioteca Rezidentului / Documents Set).",
    { ...pagingShape },
    async (a) => ok(await client.listData(LISTS.documents, paging(a))),
  );

  server.tool(
    "mitp_it_visa",
    "List IT Visa confirmations associated with the company.",
    { ...pagingShape },
    async (a) => ok(await client.listData(LISTS.itVisa, paging(a))),
  );

  // ---- Low-level escape hatch (write-capable) ----------------------------
  server.tool(
    "mitp_call",
    "Low-level escape hatch: POST to any SysbuPro endpoint /p/api/<app>/<entity>/<action> with an arbitrary JSON payload. " +
      "This is how write operations (create/update/submit/save) are performed. " +
      "Refused for non-read actions when MITP_READ_ONLY is enabled. Use with care.",
    {
      entity: z.string().describe("Entity name, e.g. 'ipMessage', 'ipReportQuarterly'."),
      action: z.string().describe("Action, e.g. 'read', 'getData', 'save', 'submit'."),
      payload: z
        .record(z.any())
        .optional()
        .describe("JSON body to send (defaults to {})."),
    },
    async (a) => {
      if (cfg.readOnly && !isReadAction(a.action)) {
        throw new Error(
          `MITP_READ_ONLY is enabled: refusing potential write action '${a.entity}/${a.action}'.`,
        );
      }
      return ok(await client.call(a.entity, a.action, a.payload ?? {}));
    },
  );
}
