import { basename, extname, parse } from "node:path";
import type { QcCheck } from "../../../core/dist/index.js";
import { buildQcReport, sha256File } from "../../../core/dist/index.js";
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

export async function inspectAndReport(path: string, maxTriangles = 50000, maxDimension?: number) {
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
      id: "geometry.normals",
      status: inspection.primitivesMissingNormals === 0 ? "pass" : "warn",
      message: `${inspection.primitivesMissingNormals} primitives missing normals`,
      value: inspection.primitivesMissingNormals
    },
    {
      id: "uv.primary",
      status: inspection.primitivesMissingUvs === 0 ? "pass" : "warn",
      message: `${inspection.primitivesMissingUvs} primitives missing TEXCOORD_0`,
      value: inspection.primitivesMissingUvs
    },
    {
      id: "textures.references",
      status: inspection.missingTextureRefs === 0 ? "pass" : "fail",
      message: `${inspection.missingTextureRefs} missing texture references`,
      value: inspection.missingTextureRefs
    },
    {
      id: "materials.texture_slots",
      status: inspection.materialCount > 0 && inspection.materialTextureSlots > 0 ? "pass" : "warn",
      message:
        inspection.materialCount === 0
          ? "No materials available for texture-slot checks"
          : `${inspection.materialTextureSlots} PBR texture slots found`,
      value: inspection.materialTextureSlots
    },
    {
      id: "materials.pbr_completeness",
      status: inspection.incompletePbrMaterials === 0 ? "pass" : "warn",
      message: `${inspection.incompletePbrMaterials} materials missing basic PBR data`,
      value: inspection.incompletePbrMaterials
    },
    {
      id: "textures.files",
      status: inspection.missingImageFiles === 0 ? "pass" : "fail",
      message: `${inspection.missingImageFiles} external texture files missing`,
      value: inspection.missingImageFiles
    },
    {
      id: "textures.dimensions",
      status: inspection.imageCount === 0 || inspection.imagesWithDimensions > 0 ? "pass" : "warn",
      message: `${inspection.imagesWithDimensions}/${inspection.imageCount} images have readable dimensions`,
      value: {
        imageCount: inspection.imageCount,
        imagesWithDimensions: inspection.imagesWithDimensions,
        oversizedImages: inspection.oversizedImages
      }
    },
    {
      id: "textures.total_size",
      status: inspection.externalTextureBytes <= 64 * 1024 * 1024 ? "pass" : "warn",
      message: `${inspection.externalTextureBytes} bytes of external textures`,
      value: inspection.externalTextureBytes
    },
    {
      id: "objects.naming",
      status: inspection.unnamedNodes === 0 && inspection.invalidNodeNames === 0 ? "pass" : "warn",
      message: `${inspection.unnamedNodes} unnamed nodes; ${inspection.invalidNodeNames} invalid node names`,
      value: {
        unnamedNodes: inspection.unnamedNodes,
        invalidNodeNames: inspection.invalidNodeNames
      }
    },
    {
      id: "bounds.present",
      status: inspection.boundingBox ? "pass" : "warn",
      message: inspection.boundingBox ? "Bounding box metadata present" : "Bounding box metadata missing",
      value: inspection.boundingBox ?? null
    },
    {
      id: "bounds.max_dimension",
      status:
        !inspection.boundingBoxSize || typeof maxDimension !== "number" || Math.max(...inspection.boundingBoxSize) <= maxDimension
          ? "pass"
          : "warn",
      message:
        inspection.boundingBoxSize
          ? `Bounding box size ${inspection.boundingBoxSize.join(" x ")}${typeof maxDimension === "number" ? `; max ${maxDimension}` : ""}`
          : "Bounding box size unavailable",
      value: {
        size: inspection.boundingBoxSize ?? null,
        maxDimension: maxDimension ?? null
      }
    }
  ];
  return buildQcReport("asset", path, checks, {
    sha256: await sha256File(path),
    inspection
  });
}
