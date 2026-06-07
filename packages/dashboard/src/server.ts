import { createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
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
const maxDashboardItems = 200;

if (!dashboardToken) {
  throw new Error("CREATIVE_MCP_DASHBOARD_TOKEN is required to start the dashboard");
}

interface DashboardJob {
  id: string;
  kind: string;
  path: string;
  status?: unknown;
  action?: unknown;
  message?: unknown;
  input?: unknown;
  risk?: unknown;
  retryable: boolean;
  updatedAt: string;
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

async function listArtifacts(): Promise<Array<{
  path: string;
  relativePath: string;
  kind: string;
  size: number;
  updatedAt: string;
  preview?: unknown;
}>> {
  const artifacts: Array<{
    path: string;
    relativePath: string;
    kind: string;
    size: number;
    updatedAt: string;
    preview?: unknown;
  }> = [];
  async function walk(dir: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const info = await stat(path);
      const relativePath = relative(artifactRoot, path);
      artifacts.push({
        path,
        relativePath,
        kind: artifactKind(path),
        size: info.size,
        updatedAt: info.mtime.toISOString(),
        preview: await artifactPreview(path)
      });
    }
  }
  await walk(artifactRoot);
  return artifacts
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, maxDashboardItems);
}

async function listJobs(): Promise<DashboardJob[]> {
  const jobs: DashboardJob[] = [];
  await collectJobFiles("rerun", join(artifactRoot, "dashboard", "reruns"), jobs);
  await collectJobFiles("log", join(artifactRoot, "logs"), jobs);
  await collectJobFiles("cep_status", join(artifactRoot, "premiere", "cep_status"), jobs);
  await collectJobFiles("approval_resolved", join(artifactRoot, "approvals", "resolved"), jobs);
  await collectJobFiles("approval_pending", join(artifactRoot, "approvals", "pending"), jobs);
  return jobs
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, maxDashboardItems);
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

async function listAdapterReports(): Promise<Array<{ path: string; updatedAt: string; summary?: unknown; adapters: unknown }>> {
  const reports = [];
  for (const artifact of await listArtifacts()) {
    if (artifact.kind !== "json") continue;
    const json = await readArtifactJson(resolveArtifactPath(artifact.relativePath));
    if (!isRecord(json.adapters)) continue;
    reports.push({
      path: artifact.relativePath,
      updatedAt: artifact.updatedAt,
      summary: json.summary,
      adapters: json.adapters
    });
  }
  return reports;
}

async function listQcReports(): Promise<Array<{ path: string; updatedAt: string; title: string; summary?: unknown; report: unknown }>> {
  const reports = [];
  for (const artifact of await listArtifacts()) {
    if (artifact.kind !== "json") continue;
    const json = await readArtifactJson(resolveArtifactPath(artifact.relativePath));
    const schema = typeof json.schema === "string" ? json.schema : "";
    const looksLikeReport =
      /qc|report/i.test(artifact.relativePath) ||
      schema.includes("qc") ||
      isRecord(json.summary) ||
      Array.isArray(json.warnings) ||
      Array.isArray(json.errors);
    if (!looksLikeReport) continue;
    reports.push({
      path: artifact.relativePath,
      updatedAt: artifact.updatedAt,
      title: schema || artifact.relativePath,
      summary: json.summary ?? json.status ?? json.message,
      report: json
    });
  }
  return reports;
}

async function listCepStatuses(): Promise<Array<{ id: string; path: string; updatedAt: string; status?: unknown; commandType?: unknown; message?: unknown; details?: unknown }>> {
  const statuses = [];
  const dir = join(artifactRoot, "premiere", "cep_status");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  for (const entry of entries.filter((name) => name.endsWith(".json"))) {
    const path = join(dir, entry);
    const info = await stat(path);
    const json = await readArtifactJson(path);
    statuses.push({
      id: entry,
      path: relative(artifactRoot, path),
      updatedAt: info.mtime.toISOString(),
      status: json.status,
      commandType: json.commandType ?? (isRecord(json.command) ? json.command.type : undefined),
      message: json.message,
      details: json.details
    });
  }
  return statuses.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, maxDashboardItems);
}

async function listGallery(kind: "blender" | "premiere"): Promise<Array<{
  path: string;
  updatedAt: string;
  size: number;
  url: string;
}>> {
  const artifacts = await listArtifacts();
  return artifacts
    .filter((artifact) => artifact.kind === "image")
    .filter((artifact) => {
      const path = artifact.relativePath.toLowerCase();
      if (kind === "blender") return path.includes("blender") || path.includes("preview");
      return path.includes("premiere") || path.includes("thumbnail") || path.includes("thumb");
    })
    .map((artifact) => ({
      path: artifact.relativePath,
      updatedAt: artifact.updatedAt,
      size: artifact.size,
      url: `/api/artifacts/file?path=${encodeURIComponent(artifact.relativePath)}`
    }))
    .slice(0, maxDashboardItems);
}

async function listReruns(): Promise<DashboardJob[]> {
  const reruns: DashboardJob[] = [];
  await collectJobFiles("rerun", join(artifactRoot, "dashboard", "reruns"), reruns);
  return reruns.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, maxDashboardItems);
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

async function retryJob(id: string): Promise<{ ok: boolean; path: string; rerun: unknown }> {
  const job = (await listJobs()).find((candidate) => candidate.id === basename(id));
  if (!job) {
    throw new Error("Job not found");
  }
  const request = await readArtifactJson(job.path);
  const action = String(request.action ?? "");
  if (!action) {
    throw new Error("Job does not include an action to retry");
  }
  if (!isRetryStatus(request.status)) {
    throw new Error("Only failed or errored jobs can be retried");
  }
  const rerun = await rerunApprovedTool({
    action,
    input: isRecord(request.input) ? request.input : {},
    risk: typeof request.risk === "string" ? request.risk : "safe_write"
  });
  const targetDir = join(artifactRoot, "dashboard", "reruns");
  await mkdir(targetDir, { recursive: true });
  const target = join(targetDir, `${Date.now()}-retry-${basename(id)}`);
  await writeFile(
    target,
    `${JSON.stringify({ retriedJob: job, rerun, createdAt: new Date().toISOString(), status: "success" }, null, 2)}\n`,
    "utf8"
  );
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

async function collectJobFiles(kind: string, dir: string, jobs: DashboardJob[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries.filter((name) => name.endsWith(".json"))) {
    const path = join(dir, entry);
    const info = await stat(path);
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    } catch {
      json = { unreadable: true };
    }
    jobs.push({
      id: entry,
      kind,
      path,
      status: json.status ?? json.decision,
      action: json.action ?? json.commandType ?? (isRecord(json.command) ? json.command.type : undefined),
      message: json.message,
      input: json.input,
      risk: json.risk,
      retryable: typeof json.action === "string" && isRetryStatus(json.status),
      updatedAt: info.mtime.toISOString()
    });
  }
}

async function readArtifactJson(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return { unreadable: true };
  }
}

function isRetryStatus(value: unknown): boolean {
  const status = String(value ?? "").toLowerCase();
  return status === "failed" || status === "failure" || status === "error";
}

async function artifactPreview(path: string): Promise<unknown> {
  const kind = artifactKind(path);
  if (kind === "json") {
    try {
      const json = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      return {
        type: "json",
        summary: json.summary ?? json.status ?? json.message ?? json.schema ?? null
      };
    } catch {
      return { type: "json", summary: "unreadable" };
    }
  }
  if (kind === "image") {
    return {
      type: "image",
      url: `/api/artifacts/file?path=${encodeURIComponent(relative(artifactRoot, path))}`
    };
  }
  if (kind === "text") {
    try {
      return { type: "text", sample: (await readFile(path, "utf8")).slice(0, 500) };
    } catch {
      return { type: "text", sample: "" };
    }
  }
  return undefined;
}

function artifactKind(path: string): string {
  const ext = extname(path).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return "image";
  if (ext === ".json" || ext === ".otio") return "json";
  if ([".txt", ".log", ".srt", ".md"].includes(ext)) return "text";
  return ext ? ext.slice(1) : "file";
}

function resolveArtifactPath(value: string): string {
  const path = resolve(artifactRoot, value);
  const safeRelative = relative(artifactRoot, path);
  if (safeRelative === ".." || safeRelative.startsWith(`..${sep}`) || resolve(path) === resolve(artifactRoot)) {
    throw new Error("Artifact path is outside the artifact root");
  }
  return path;
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

function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".json" || ext === ".otio") return "application/json";
  return "text/plain";
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
  if (url.pathname === "/api/artifacts" && req.method === "GET") {
    void listArtifacts().then((artifacts) => {
      writeJson(res, 200, { artifactRoot, artifacts });
    });
    return;
  }
  if (url.pathname === "/api/jobs" && req.method === "GET") {
    void listJobs().then((jobs) => {
      writeJson(res, 200, { artifactRoot, jobs });
    });
    return;
  }
  if (url.pathname === "/api/adapters" && req.method === "GET") {
    void listAdapterReports().then((reports) => {
      writeJson(res, 200, { artifactRoot, reports });
    });
    return;
  }
  if (url.pathname === "/api/qc-reports" && req.method === "GET") {
    void listQcReports().then((reports) => {
      writeJson(res, 200, { artifactRoot, reports });
    });
    return;
  }
  if (url.pathname === "/api/cep-status" && req.method === "GET") {
    void listCepStatuses().then((statuses) => {
      writeJson(res, 200, { artifactRoot, statuses });
    });
    return;
  }
  if (url.pathname === "/api/gallery" && req.method === "GET") {
    const kind = url.searchParams.get("kind") === "premiere" ? "premiere" : "blender";
    void listGallery(kind).then((items) => {
      writeJson(res, 200, { artifactRoot, kind, items });
    });
    return;
  }
  if (url.pathname === "/api/reruns" && req.method === "GET") {
    void listReruns().then((reruns) => {
      writeJson(res, 200, { artifactRoot, reruns });
    });
    return;
  }
  if (url.pathname === "/api/artifacts/file" && req.method === "GET") {
    void Promise.resolve()
      .then(async () => {
        const path = resolveArtifactPath(String(url.searchParams.get("path") ?? ""));
        const info = await stat(path);
        if (!info.isFile()) {
          throw new Error("Artifact is not a file");
        }
        res.statusCode = 200;
        res.setHeader("content-type", contentTypeFor(path));
        createReadStream(path).pipe(res);
      })
      .catch((error: unknown) => {
        writeJson(res, 404, { ok: false, error: error instanceof Error ? error.message : String(error) });
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
  if (url.pathname === "/api/jobs/retry" && req.method === "POST") {
    void readBody(req)
      .then((body) => JSON.parse(body) as { id: string })
      .then(({ id }) => retryJob(id))
      .then((result) => {
        writeJson(res, 200, result);
      })
      .catch((error: unknown) => {
        writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
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
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    .preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .artifact-card { border: 1px solid #ddd; background: white; padding: 10px; border-radius: 6px; min-height: 150px; }
    .artifact-card img { max-width: 100%; max-height: 180px; display: block; background: #eee; }
    .artifact-meta { color: #555; font-size: 12px; overflow-wrap: anywhere; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    .toolbar a, .artifact-card a { border: 1px solid #ccc; color: #202124; background: white; padding: 6px 10px; border-radius: 4px; text-decoration: none; }
    .detail-grid { display: grid; grid-template-columns: minmax(240px, 1fr) minmax(320px, 2fr); gap: 16px; align-items: start; }
    .status-success { color: #137333; font-weight: 700; }
    .status-failed, .status-error, .status-failure { color: #a50e0e; font-weight: 700; }
    .muted { color: #666; }
  </style>
</head>
<body>
  <h1>Creative Pipeline MCP Dashboard</h1>
  <p>Artifact root: ${artifactRoot}</p>
  <nav class="toolbar">
    <a href="#approvals-section">Approvals</a>
    <a href="#adapters-section">Adapters</a>
    <a href="#qc-section">QC Reports</a>
    <a href="#cep-section">CEP Status</a>
    <a href="#blender-section">Blender Previews</a>
    <a href="#premiere-section">Premiere Thumbnails</a>
    <a href="#jobs-section">Jobs</a>
  </nav>
  <section id="approvals-section">
    <h2>Pending Approvals</h2>
    <table id="approvals"><thead><tr><th>Request</th><th>Action</th></tr></thead><tbody></tbody></table>
  </section>
	  <section id="adapters-section">
	    <h2>Adapter Availability</h2>
	    <table id="adapters"><thead><tr><th>Report</th><th>Adapter</th><th>Status</th><th>Command</th></tr></thead><tbody></tbody></table>
	  </section>
	  <section>
	    <h2>Reports</h2>
	    <table id="reports"><thead><tr><th>Report</th><th>Summary</th></tr></thead><tbody></tbody></table>
	  </section>
	  <section id="qc-section">
	    <h2>QC Report Detail</h2>
	    <div class="detail-grid">
	      <table id="qcReports"><thead><tr><th>Updated</th><th>Report</th><th>Summary</th></tr></thead><tbody></tbody></table>
	      <pre id="qcDetail" class="muted">Select a QC report.</pre>
	    </div>
	  </section>
	  <section id="cep-section">
	    <h2>CEP Status</h2>
	    <table id="cepStatus"><thead><tr><th>Updated</th><th>Command</th><th>Status</th><th>Message</th><th>Path</th></tr></thead><tbody></tbody></table>
	  </section>
	  <section id="artifacts-section">
	    <h2>Artifact Previews</h2>
	    <div id="artifacts" class="preview-grid"></div>
	  </section>
	  <section id="blender-section">
	    <h2>Blender Preview Gallery</h2>
	    <div id="blenderGallery" class="preview-grid"></div>
	  </section>
	  <section id="premiere-section">
	    <h2>Premiere Thumbnail Gallery</h2>
	    <div id="premiereGallery" class="preview-grid"></div>
	  </section>
	  <section id="jobs-section">
	    <h2>Job History</h2>
	    <table id="jobs"><thead><tr><th>Updated</th><th>Kind</th><th>Action</th><th>Status</th><th>Path</th><th>Retry</th></tr></thead><tbody></tbody></table>
	  </section>
	  <section>
	    <h2>Rerun History</h2>
	    <table id="reruns"><thead><tr><th>Updated</th><th>Status</th><th>Action</th><th>Path</th></tr></thead><tbody></tbody></table>
	  </section>
	  <script>
	    const token = new URLSearchParams(location.search).get('token') || localStorage.getItem('creativeMcpDashboardToken') || '';
	    if (token) localStorage.setItem('creativeMcpDashboardToken', token);
	    const headers = { 'content-type': 'application/json', 'x-creative-mcp-dashboard-token': token };
	    function text(value) {
	      return value === undefined || value === null ? '' : String(value);
	    }
	    function formatBytes(value) {
	      if (!Number.isFinite(value)) return '';
	      if (value < 1024) return value + ' B';
	      if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB';
	      return (value / 1024 / 1024).toFixed(1) + ' MB';
	    }
	    function tokenized(url) {
	      return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
	    }
	    function statusClass(value) {
	      return 'status-' + text(value).toLowerCase();
	    }
	    function appendCell(row, value, asPre = false) {
	      const cell = document.createElement('td');
	      if (asPre) {
	        const pre = document.createElement('pre');
	        pre.textContent = value;
	        cell.appendChild(pre);
	      } else {
	        cell.textContent = value;
	      }
	      row.appendChild(cell);
	      return cell;
	    }
	    function downloadLink(path) {
	      const link = document.createElement('a');
	      link.href = tokenized('/api/artifacts/file?path=' + encodeURIComponent(path));
	      link.download = path.split('/').pop() || 'artifact';
	      link.textContent = 'Download';
	      return link;
	    }
	    function renderImageCard(target, item) {
	      const card = document.createElement('article');
	      card.className = 'artifact-card';
	      const title = document.createElement('div');
	      title.className = 'artifact-meta';
	      title.textContent = item.path + ' · ' + formatBytes(item.size || 0);
	      card.appendChild(title);
	      const img = document.createElement('img');
	      img.src = tokenized(item.url);
	      img.alt = item.path;
	      card.appendChild(img);
	      card.appendChild(downloadLink(item.path));
	      target.appendChild(card);
	    }
	    function retryJob(id) {
	      fetch('/api/jobs/retry', {
	        method: 'POST',
	        headers,
	        body: JSON.stringify({ id })
	      }).then(() => location.reload());
	    }
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
	        appendCell(row, JSON.stringify(approval.request, null, 2), true);
	        const actionCell = document.createElement('td');
	        const approve = document.createElement('button');
	        approve.textContent = 'Approve';
	        approve.onclick = () => resolveApproval(approval.id, 'approved', approval.request.approvalToken || '');
	        const reject = document.createElement('button');
	        reject.textContent = 'Reject';
	        reject.onclick = () => resolveApproval(approval.id, 'rejected', approval.request.approvalToken || '');
	        actionCell.appendChild(approve);
	        actionCell.appendChild(reject);
	        row.appendChild(actionCell);
	        tbody.appendChild(row);
	      }
	    });
	    fetch('/api/adapters', { headers }).then(r => r.json()).then(data => {
	      const tbody = document.querySelector('#adapters tbody');
	      for (const report of data.reports) {
	        for (const [name, adapter] of Object.entries(report.adapters || {})) {
	          const row = document.createElement('tr');
	          appendCell(row, report.path);
	          appendCell(row, name);
	          const status = appendCell(row, adapter.available ? 'available' : 'missing');
	          status.className = adapter.available ? 'status-success' : 'status-failed';
	          appendCell(row, adapter.command || '');
	          tbody.appendChild(row);
	        }
	      }
	    });
	    fetch('/api/reports', { headers }).then(r => r.json()).then(data => {
	      const tbody = document.querySelector('#reports tbody');
	      for (const report of data.reports) {
	        const row = document.createElement('tr');
	        appendCell(row, report.path);
	        appendCell(row, JSON.stringify(report.summary ?? {}, null, 2), true);
	        tbody.appendChild(row);
	      }
	    });
	    fetch('/api/qc-reports', { headers }).then(r => r.json()).then(data => {
	      const tbody = document.querySelector('#qcReports tbody');
	      const detail = document.querySelector('#qcDetail');
	      for (const report of data.reports) {
	        const row = document.createElement('tr');
	        appendCell(row, report.updatedAt);
	        appendCell(row, report.path);
	        appendCell(row, JSON.stringify(report.summary ?? {}, null, 2), true);
	        row.onclick = () => {
	          detail.textContent = JSON.stringify(report.report, null, 2);
	          detail.className = '';
	        };
	        tbody.appendChild(row);
	      }
	    });
	    fetch('/api/cep-status', { headers }).then(r => r.json()).then(data => {
	      const tbody = document.querySelector('#cepStatus tbody');
	      for (const statusRecord of data.statuses) {
	        const row = document.createElement('tr');
	        appendCell(row, statusRecord.updatedAt);
	        appendCell(row, text(statusRecord.commandType));
	        const status = appendCell(row, text(statusRecord.status));
	        status.className = statusClass(statusRecord.status);
	        appendCell(row, text(statusRecord.message));
	        appendCell(row, statusRecord.path);
	        tbody.appendChild(row);
	      }
	    });
	    fetch('/api/artifacts', { headers }).then(r => r.json()).then(data => {
	      const target = document.querySelector('#artifacts');
	      for (const artifact of data.artifacts) {
	        const card = document.createElement('article');
	        card.className = 'artifact-card';
	        const title = document.createElement('div');
	        title.className = 'artifact-meta';
	        title.textContent = artifact.relativePath + ' · ' + artifact.kind + ' · ' + formatBytes(artifact.size);
	        card.appendChild(title);
	        if (artifact.preview?.type === 'image') {
	          const img = document.createElement('img');
	          img.src = tokenized(artifact.preview.url);
	          img.alt = artifact.relativePath;
	          card.appendChild(img);
	        } else if (artifact.preview?.type === 'json') {
	          const pre = document.createElement('pre');
	          pre.textContent = JSON.stringify(artifact.preview.summary ?? {}, null, 2);
	          card.appendChild(pre);
	        } else if (artifact.preview?.type === 'text') {
	          const pre = document.createElement('pre');
	          pre.textContent = artifact.preview.sample || '';
	          card.appendChild(pre);
	        }
	        card.appendChild(downloadLink(artifact.relativePath));
	        target.appendChild(card);
	      }
	    });
	    fetch('/api/gallery?kind=blender', { headers }).then(r => r.json()).then(data => {
	      const target = document.querySelector('#blenderGallery');
	      for (const item of data.items) renderImageCard(target, item);
	    });
	    fetch('/api/gallery?kind=premiere', { headers }).then(r => r.json()).then(data => {
	      const target = document.querySelector('#premiereGallery');
	      for (const item of data.items) renderImageCard(target, item);
	    });
	    fetch('/api/jobs', { headers }).then(r => r.json()).then(data => {
	      const tbody = document.querySelector('#jobs tbody');
	      for (const job of data.jobs) {
	        const row = document.createElement('tr');
	        [job.updatedAt, job.kind, text(job.action), text(job.status), job.path].forEach((value, index) => {
	          const cell = appendCell(row, value);
	          if (index === 3) cell.className = statusClass(job.status);
	        });
	        const retryCell = document.createElement('td');
	        if (job.retryable) {
	          const button = document.createElement('button');
	          button.textContent = 'Retry';
	          button.onclick = () => retryJob(job.id);
	          retryCell.appendChild(button);
	        }
	        row.appendChild(retryCell);
	        tbody.appendChild(row);
	      }
	    });
	    fetch('/api/reruns', { headers }).then(r => r.json()).then(data => {
	      const tbody = document.querySelector('#reruns tbody');
	      for (const rerun of data.reruns) {
	        const row = document.createElement('tr');
	        appendCell(row, rerun.updatedAt);
	        const status = appendCell(row, text(rerun.status));
	        status.className = statusClass(rerun.status);
	        appendCell(row, text(rerun.action));
	        appendCell(row, rerun.path);
	        tbody.appendChild(row);
	      }
	    });
	  </script>
</body>
</html>`);
}).listen(port, host, () => {
  console.log(`Creative Pipeline MCP dashboard listening on http://${host}:${port}`);
});
