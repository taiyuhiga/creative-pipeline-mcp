import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const artifactRoot = resolve(process.env.CREATIVE_MCP_ARTIFACTS ?? "artifacts");
const port = Number(process.env.PORT ?? 4173);

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

createServer((req, res) => {
  if (req.url === "/api/reports") {
    void listReports().then((reports) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ artifactRoot, reports }, null, 2));
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
    table { border-collapse: collapse; width: 100%; background: white; }
    td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
  </style>
</head>
<body>
  <h1>Creative Pipeline MCP Dashboard</h1>
  <p>Artifact root: ${artifactRoot}</p>
  <table id="reports"><thead><tr><th>Report</th><th>Summary</th></tr></thead><tbody></tbody></table>
  <script>
    fetch('/api/reports').then(r => r.json()).then(data => {
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
}).listen(port, () => {
  console.log(`Creative Pipeline MCP dashboard listening on http://127.0.0.1:${port}`);
});

