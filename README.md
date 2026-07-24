# MITP MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for the
**Moldova Innovation Technology Park (MITP)** resident portal. It lets an AI
assistant (Claude Desktop, Claude Code, or any MCP client) read — and, where you
allow it, act on — your MITP residency data: applications, mailbox, reports,
financial transactions, polls, documents, IT-visa records and company profile.

> **Unofficial project.** Not affiliated with, endorsed by, or supported by
> Moldova Innovation Technology Park or the operators of the SysbuPro platform.
> It automates access to the portal **using your own credentials and permissions**.
> Use it only for accounts you are authorized to access, and in line with MITP's
> terms of use. See [Legal & safety](#legal--safety).

---

## What it talks to

The public site `mitp.md` is a marketing site with no API. The actual resident
application lives at **`paap.mitp.md`** and is built on **SysbuPro**, a
metadata-driven low-code platform (Java/Spring backend). Its API is small and
uniform:

```
POST https://paap.mitp.md/p/api/resident/<entity>/<action>
Content-Type: application/json
Cookie: <session>            ← established via MPass SSO
Body: { ...json... }
```

Because the platform is metadata-driven, a handful of generic endpoints
(`list/getData`, `list/read`, `<entity>/read`, `user/getUserInfo`, …) cover almost
the entire surface. This server wraps them as ergonomic MCP tools, plus a
low-level escape hatch for everything else.

## Authentication model

Login uses **[MPass](https://mpass.gov.md)**, Moldova's national e-government SSO
(SAML). After the handshake, the portal sets an **HttpOnly session cookie**.
MPass **cannot be automated headlessly** (it relies on mobile signature /
certificate / OTP), so this server uses a **persisted browser session**:

1. You run `npm run login` once. A real browser opens; you complete the MPass
   sign-in yourself.
2. The resulting browser session (including the HttpOnly cookie) is saved to
   `~/.mitp-mcp/session.json`.
3. The MCP server reuses that session for API calls until it expires, then asks
   you to log in again.

```
┌────────────┐   npm run login   ┌───────────────┐   MPass SAML   ┌───────────┐
│  You (once)│ ────────────────▶ │ Chromium (UI) │ ─────────────▶ │  mpass.md │
└────────────┘                   └──────┬────────┘                └───────────┘
                                        │ storageState (HttpOnly cookie)
                                        ▼
                                ~/.mitp-mcp/session.json
                                        │
┌────────────┐   MCP (stdio)    ┌───────┴────────┐   Cookie + JSON   ┌───────────┐
│ Claude etc.│ ◀──────────────▶ │ mitp-mcp-server│ ────────────────▶ │ paap.mitp │
└────────────┘                   └────────────────┘                  └───────────┘
```

## Prerequisites

- **Node.js ≥ 18** (uses the native `fetch`).
- A **Chromium** build for the one-time login step:
  ```bash
  npx playwright install chromium
  ```
- A valid **MITP resident account** you are authorized to use.

## Install & build

```bash
git clone https://github.com/cmaftuleac/mitp-mcp-server.git
cd mitp-mcp-server
npm install                 # also builds via the prepare hook
npx playwright install chromium
```

## Log in (one time)

```bash
npm run login
```

A browser window opens at `https://paap.mitp.md`. Complete the MPass sign-in and
select your company, then return to the terminal and press **Enter** (or wait for
auto-detection). Your session is saved to `~/.mitp-mcp/session.json`.

Re-run this whenever the session expires (the server will tell you when).

## Configure your MCP client

### Claude Desktop

Add to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/` on macOS):

```json
{
  "mcpServers": {
    "mitp": {
      "command": "node",
      "args": ["/absolute/path/to/mitp-mcp-server/dist/index.js"],
      "env": { "MITP_READ_ONLY": "false" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add mitp -- node /absolute/path/to/mitp-mcp-server/dist/index.js
```

Then ask, e.g. _"With MITP, list my unread inbox messages"_ or
_"Show my company's latest financial transactions"_.

## Tools

### Identity & context
| Tool | Description |
|---|---|
| `mitp_whoami` | Current user, role, active company, system date/number formats. |
| `mitp_companies` | Companies you can act on behalf of. |
| `mitp_company_profile` | The selected company's profile record. |

### Curated resident domains
| Tool | Description | List id |
|---|---|---|
| `mitp_applications` | Residency applications | `ipResidencyApplications` |
| `mitp_mailbox` | Messages by folder (`inbox`/`sent`/`draft`/`all`) | `ipMessage*` |
| `mitp_reports` | Reports: `periodic` / `annual` | `ipReportQuarterly` / `ipReportAnnual` |
| `mitp_polls` | Polls / surveys | `ipVoteList` |
| `mitp_publications` | Platform publications | `ipPlatformInfoItem` |
| `mitp_financial_transactions` | Financial transactions | `financialTransactions` |
| `mitp_documents` | Document set (Biblioteca Rezidentului) | `CompanyLibrary` |
| `mitp_it_visa` | IT Visa confirmations | `companyProfileItVisaConfirmation` |

All curated list tools accept `textFilter`, `pageSize`, `pageNumber`.

### Generic access
| Tool | Description |
|---|---|
| `mitp_list` | Query any list id with paging/sort/filter. |
| `mitp_list_schema` | Column/field metadata for a list id. |
| `mitp_read` | Generic `<entity>/read` by id. |
| `mitp_call` | **Escape hatch** — POST any `<entity>/<action>` with a JSON payload. Enables writes. Gated by `MITP_READ_ONLY`. |

List tools return a Spring-style page: `{ content: [...], totalElements, totalPages, number, size }`.

## Write operations

Reads are covered by dedicated tools. Writes (create/update/submit/save) go
through **`mitp_call`**, because SysbuPro save payloads are screen-specific and
must be captured from your own account rather than guessed.

**Discovery recipe** for a new write action:

1. In the portal, open your browser DevTools → **Network** (filter `/p/api/`).
2. Perform the action once in the UI (e.g. submit a quarterly report).
3. Note the request path (`.../p/api/resident/<entity>/<action>`) and JSON body.
4. Reproduce it with `mitp_call`:
   ```
   mitp_call(entity="ipReportQuarterly", action="save", payload={ ...captured body... })
   ```
5. If it's reusable, add a curated tool for it in `src/tools.ts` and open a PR.

Set `MITP_READ_ONLY=true` to hard-block every non-read action (a safe default for
untrusted automation on this government-adjacent portal).

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `MITP_BASE_URL` | `https://paap.mitp.md` | Portal origin. |
| `MITP_APP` | `resident` | SysbuPro application id (path segment). |
| `MITP_SESSION_PATH` | `~/.mitp-mcp/session.json` | Persisted session location. |
| `MITP_READ_ONLY` | `false` | Refuse write actions when truthy. |
| `MITP_COOKIE` | _(unset)_ | Raw `Cookie` header override (skips the session file). |

## Project layout

```
src/
  index.ts     MCP server entry (stdio transport)
  login.ts     One-time interactive MPass login → persisted session
  config.ts    Env-driven configuration
  auth.ts      AuthProvider: SessionFileAuth (default) | EnvCookieAuth
  client.ts    MitpClient — thin SysbuPro API wrapper (call/list/read/whoami…)
  tools.ts     MCP tool registrations (generic + curated + escape hatch)
  errors.ts    MitpAuthError / MitpApiError
```

## Legal & safety

- **Your access only.** The server acts strictly with your session and your
  permissions. Don't use it against accounts or data you aren't entitled to.
- **Respect MITP's terms.** This is an unofficial integration over an
  undocumented internal API. Confirm that automated access is acceptable for your
  use, especially for writes.
- **Stability.** The API is undocumented and may change without notice
  (SysbuPro metadata is versioned). Treat breakage as expected maintenance.
- **Secrets.** `~/.mitp-mcp/session.json` contains a live session cookie — it is
  gitignored; keep it private and delete it to sign out.
- For a production, multi-resident deployment, seek an **official API / service
  account** from MITP rather than relying on persisted browser sessions.

## Roadmap

- Curated write tools once save/submit contracts are captured (reports, mailbox reply).
- Real-time notifications via `notification/connect` (SSE/WebSocket).
- Optional official-API auth provider (`ApiTokenAuth`) if MITP exposes one.
- Structured (typed) outputs for the common domains.

## Contributing

Issues and PRs welcome — especially captured write contracts and additional list
ids. Keep tool schemas honest: only ship a curated tool for a payload shape you
have actually observed against a live account.

## License

[MIT](./LICENSE) © 2026 Corneliu Maftuleac
