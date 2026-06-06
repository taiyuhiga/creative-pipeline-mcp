import { basename, extname, parse } from "node:path";
import type { QcCheck } from "@creative-pipeline-mcp/core";
import { buildQcReport, sha256File } from "@creative-pipeline-mcp/core";
import { inspectGltf } from "../adapters/gltf.js";

export function requirePath(input: Record<string, unknown>): string {
  const path = input.path ?? input.assetPath ?? input.sourcePath;
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("Expected path, assetPath, or sourcePath");
  }
  return path;
}

export function artifactName(path: string, suffix: string): string {
  const parsed = parse(basename(path));
  return `blender/${parsed.name}${suffix}`;
}

export async function inspectAndReport(path: string, maxTriangles = 50000) {
  const ext = extname(path).toLowerCase();
  if (ext !== ".glb" && ext !== ".gltf") {
    const checks: QcCheck[] = [
      {
        id: "format.supported",
        status: ext === ".blend" ? "warn" : "fail",
        message:
          ext === ".blend"
            ? "Blend inspection requires external Blender; adapter is intentionally optional"
            : "Only .glb, .gltf, and externally inspected .blend files are supported by the MVP",
        value: ext
      }
    ];
    return buildQcReport("asset", path, checks, { sha256: await sha256File(path) });
  }
  const inspection = await inspectGltf(path);
  const checks: QcCheck[] = [
    {
      id: "format.gltf_version",
      status: inspection.version?.startsWith("2") ? "pass" : "fail",
      message: `glTF version ${inspection.version ?? "unknown"}`,
      value: inspection.version
    },
    {
      id: "geometry.mesh_count",
      status: inspection.meshCount > 0 ? "pass" : "fail",
      message: `${inspection.meshCount} meshes found`,
      value: inspection.meshCount
    },
    {
      id: "geometry.triangle_budget",
      status: inspection.triangleCount <= maxTriangles ? "pass" : "warn",
      message: `${inspection.triangleCount} triangles; budget ${maxTriangles}`,
      value: inspection.triangleCount
    },
    {
      id: "materials.present",
      status: inspection.materialCount > 0 ? "pass" : "warn",
      message: `${inspection.materialCount} materials found`,
      value: inspection.materialCount
    },
    {
      id: "textures.references",
      status: inspection.missingTextureRefs === 0 ? "pass" : "fail",
      message: `${inspection.missingTextureRefs} missing texture references`,
      value: inspection.missingTextureRefs
    },
    {
      id: "bounds.present",
      status: inspection.boundingBox ? "pass" : "warn",
      message: inspection.boundingBox ? "Bounding box metadata present" : "Bounding box metadata missing",
      value: inspection.boundingBox ?? null
    }
  ];
  return buildQcReport("asset", path, checks, {
    sha256: await sha256File(path),
    inspection
  });
}

