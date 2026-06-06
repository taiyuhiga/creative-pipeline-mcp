import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  ApprovalPolicy,
  ArtifactStore,
  coreTools,
  defaultLicenseManifest,
  Router,
  ToolRegistry,
  type PermissionLevel,
  type ToolRisk
} from "@creative-pipeline-mcp/core";
import { blenderTools } from "@creative-pipeline-mcp/blender-pro-mcp";
import { premiereTools } from "@creative-pipeline-mcp/premiere-pro-mcp";
import { directorTools } from "@creative-pipeline-mcp/director-agent";

const artifactRoot = resolve(process.env.CREATIVE_MCP_ARTIFACTS ?? "artifacts");
const port = Number(process.env.PORT ?? 4173);
const host = "127.0.0.1";
const dashboardToken = process.env.CREATIVE_MCP_DASHBOARD_TOKEN;

if (!dashboardToken) {
  throw new Error("CREATIVE_MCP_DASHBOARD_TOKEN is required to start the dashboard");
}

async function listReports(): Promise<Array<{ path: string; summary?: unknown }>> {
  const reports: Array<{ path: string; summary?: unknown }> = [];
  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      if (entry.endsWith(".json")) {
        try {
          const json = JSON.parse(await readFile(path, "utf8")) as { summary?: unknown };
          reports.push({ path, summary: json.summary });
        } catch {
          reports.push({ path });
        }
      } else if (!entry.includes(".")) {
        await walk(path);
      }
    }
  }
  await walk(artifactRoot);
  return reports;
}

async function listApprovals(): Promise<Array<{ id: string; path: string; request: unknown }>> {
  const approvalsDir = join(artifactRoot, "approvals", "pending");
  let entries: string[];
  try {
    entries = await readdir(approvalsDir);
  } catch {
    return [];
  }
  const approvals = [];
  for (const entry of entries.filter((name) => name.endsWith(".json"))) {
    const path = join(approvalsDir, entry);
    try {
      approvals.push({ id: entry, path, request: JSON.parse(await readFile(path, "utf8")) });
    } catch {
      approvals.push({ id: entry, path, request: { unreadable: true } });
    }
  }
  return approvals;
}

async function resolveApproval(
  id: string,
  decision: "approved" | "rejected",
  approvalToken: string
): Promise<{ ok: boolean; path?: string; rerun?: unknown }> {
  const safeId = basename(id);
  const source = join(artifactRoot, "approvals", "pending", safeId);
  const targetDir = join(artifactRoot, "approvals", "resolved");
  await mkdir(targetDir, { recursive: true });
  const target = join(targetDir, `${Date.now()}-${decision}-${safeId}`);
  const request = JSON.parse(await readFile(source, "utf8")) as Record<string, unknown>;
  if (typeof request.approvalToken === "string" && request.approvalToken !== approvalToken) {
    throw new Error("Invalid approval token");
  }
  const rerun = decision === "approved" ? await rerunApprovedTool(request) : undefined;
  await writeFile(
    target,
    `${JSON.stringify({ ...request, decision, resolvedAt: new Date().toISOString(), rerun }, null, 2)}\n`,
    "utf8"
  );
  await rename(source, `${source}.resolved`);
  return { ok: true, path: target, rerun };
}

async function rerunApprovedTool(request: Record<string, unknown>): Promise<unknown> {
  const action = String(request.action ?? "");
  const input = isRecord(request.input) ? request.input : {};
  const registry = new ToolRegistry();
  registry.registerMany([...coreTools, ...blenderTools, ...premiereTools, ...directorTools]);
  const router = new Router(registry);
  const store = new ArtifactStore(artifactRoot);
  return router.run(action, {
    artifactStore: store,
    approvalPolicy: new ApprovalPolicy(permissionForRisk(String(request.risk ?? "safe_write") as ToolRisk)),
    licenseManifest: defaultLicenseManifest(),
    logger: {
      log(event, detail) {
        void store.writeJson(`logs/${Date.now()}-${event}.json`, detail);
      }
    }
  }, input);
}

function permissionForRisk(risk: ToolRisk): PermissionLevel {
  if (risk === "read") return "read_only";
  if (risk === "safe_write") return "safe_write";
  if (risk === "project_write") return "project_write";
  if (risk === "destructive") return "destructive";
  return "admin";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk);
    });
    req.on("end", () => resolveBody(body));
  });
}

function isLocalHostHeader(req: IncomingMessage): boolean {
  const header = String(req.headers.host ?? "");
  return header.startsWith("127.0.0.1:") || header.startsWith("localhost:") || header === "127.0.0.1" || header === "localhost";
}

function requestToken(req: IncomingMessage, url: URL): string {
  return String(req.headers["x-creative-mcp-dashboard-token"] ?? url.searchParams.get("token") ?? "");
}

function isAuthorized(req: IncomingMessage, url: URL): boolean {
  return requestToken(req, url) === dashboardToken;
}

function writeJson(res: ServerResponse, statusCode: number, value: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value, null, 2));
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
  if (!isLocalHostHeader(req)) {
    writeJson(res, 403, { ok: false, error: "Dashboard only accepts localhost requests" });
    return;
  }
  if (url.pathname.startsWith("/api/") && !isAuthorized(req, url)) {
    writeJson(res, 401, { ok: false, error: "Missing or invalid dashboard token" });
    return;
  }
  if (url.pathname === "/api/reports") {
    void listReports().then((reports) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ artifactRoot, reports }, null, 2));
    });
    return;
  }
  if (url.pathname === "/api/approvals" && req.method === "GET") {
    void listApprovals().then((approvals) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ approvals }, null, 2));
    });
    return;
  }
  if (url.pathname === "/api/approvals/resolve" && req.method === "POST") {
    void readBody(req)
      .then((body) => JSON.parse(body) as { id: string; decision: "approved" | "rejected"; approvalToken: string })
      .then(({ id, decision, approvalToken }) => resolveApproval(id, decision, approvalToken))
      .then((result) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(result, null, 2));
      })
      .catch((error: unknown) => {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      });
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Creative Pipeline MCP Dashboard</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; color: #202124; background: #fafafa; }
    section { margin: 24px 0; }
    table { border-collapse: collapse; width: 100%; background: white; }
    td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
    button { margin-right: 8px; }
  </style>
</head>
<body>
  <h1>Creative Pipeline MCP Dashboard</h1>
  <p>Artifact root: ${artifactRoot}</p>
  <section>
    <h2>Pending Approvals</h2>
    <table id="approvals"><thead><tr><th>Request</th><th>Action</th></tr></thead><tbody></tbody></table>
  </section>
  <section>
    <h2>Reports</h2>
    <table id="reports"><thead><tr><th>Report</th><th>Summary</th></tr></thead><tbody></tbody></table>
  </section>
  <script>
    const token = new URLSearchParams(location.search).get('token') || localStorage.getItem('creativeMcpDashboardToken') || '';
    if (token) localStorage.setItem('creativeMcpDashboardToken', token);
    const headers = { 'content-type': 'application/json', 'x-creative-mcp-dashboard-token': token };
    function resolveApproval(id, decision, approvalToken) {
      fetch('/api/approvals/resolve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, decision, approvalToken })
      }).then(() => location.reload());
    }
    fetch('/api/approvals', { headers }).then(r => r.json()).then(data => {
      const tbody = document.querySelector('#approvals tbody');
      for (const approval of data.approvals) {
        const row = document.createElement('tr');
        row.innerHTML = '<td><pre>' + JSON.stringify(approval.request, null, 2) + '</pre></td>' +
          '<td><button data-decision="approved">Approve</button><button data-decision="rejected">Reject</button></td>';
        row.querySelector('[data-decision="approved"]').onclick = () => resolveApproval(approval.id, 'approved', approval.request.approvalToken || '');
        row.querySelector('[data-decision="rejected"]').onclick = () => resolveApproval(approval.id, 'rejected', approval.request.approvalToken || '');
        tbody.appendChild(row);
      }
    });
    fetch('/api/reports', { headers }).then(r => r.json()).then(data => {
      const tbody = document.querySelector('#reports tbody');
      for (const report of data.reports) {
        const row = document.createElement('tr');
        row.innerHTML = '<td>' + report.path + '</td><td><pre>' + JSON.stringify(report.summary ?? {}, null, 2) + '</pre></td>';
        tbody.appendChild(row);
      }
    });
  </script>
</body>
</html>`);
}).listen(port, host, () => {
  console.log(`Creative Pipeline MCP dashboard listening on http://${host}:${port}`);
});
