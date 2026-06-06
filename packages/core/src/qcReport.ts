import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface QcCheck {
  id: string;
  status: "pass" | "warn" | "fail" | "not_applicable";
  message: string;
  value?: unknown;
}

export interface QcReport {
  kind: "asset" | "media" | "pipeline";
  target: string;
  generatedAt: string;
  summary: {
    status: "pass" | "warn" | "fail";
    pass: number;
    warn: number;
    fail: number;
  };
  checks: QcCheck[];
  metadata?: Record<string, unknown>;
}

export function buildQcReport(
  kind: QcReport["kind"],
  target: string,
  checks: QcCheck[],
  metadata: Record<string, unknown> = {}
): QcReport {
  const pass = checks.filter((check) => check.status === "pass").length;
  const warn = checks.filter((check) => check.status === "warn").length;
  const fail = checks.filter((check) => check.status === "fail").length;
  return {
    kind,
    target,
    generatedAt: new Date().toISOString(),
    summary: {
      status: fail > 0 ? "fail" : warn > 0 ? "warn" : "pass",
      pass,
      warn,
      fail
    },
    checks,
    metadata
  };
}

export async function sha256File(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

