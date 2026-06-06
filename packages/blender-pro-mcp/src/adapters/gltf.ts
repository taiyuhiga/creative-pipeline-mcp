import { readFile } from "node:fs/promises";

export interface GltfInspection {
  format: "glb" | "gltf";
  version?: string;
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  imageCount: number;
  primitiveCount: number;
  vertexCount: number;
  triangleCount: number;
  primitivesMissingNormals: number;
  primitivesMissingUvs: number;
  missingTextureRefs: number;
  materialTextureSlots: number;
  boundingBox?: { min: number[]; max: number[] };
}

interface GltfJson {
  asset?: { version?: string };
  nodes?: unknown[];
  meshes?: Array<{ primitives?: Array<Record<string, unknown>> }>;
  accessors?: Array<{ count?: number; min?: number[]; max?: number[] }>;
  materials?: Array<Record<string, unknown>>;
  textures?: Array<{ source?: number }>;
  images?: unknown[];
}

export async function inspectGltf(path: string): Promise<GltfInspection> {
  const bytes = await readFile(path);
  const json = path.toLowerCase().endsWith(".glb") ? readGlbJson(bytes) : JSON.parse(bytes.toString("utf8"));
  return summarize(json, path.toLowerCase().endsWith(".glb") ? "glb" : "gltf");
}

function readGlbJson(bytes: Buffer): GltfJson {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) {
    throw new Error("Invalid GLB header");
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(bytes.subarray(offset, offset + chunkLength).toString("utf8").trim());
    }
    offset += chunkLength;
  }
  throw new Error("GLB JSON chunk not found");
}

function summarize(json: GltfJson, format: "glb" | "gltf"): GltfInspection {
  const accessors = json.accessors ?? [];
  let primitiveCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let primitivesMissingNormals = 0;
  let primitivesMissingUvs = 0;
  const bbox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount += 1;
      const attributes = primitive.attributes as Record<string, number> | undefined;
      if (typeof attributes?.NORMAL !== "number") {
        primitivesMissingNormals += 1;
      }
      if (typeof attributes?.TEXCOORD_0 !== "number") {
        primitivesMissingUvs += 1;
      }
      const positionAccessor = attributes ? accessors[attributes.POSITION] : undefined;
      if (positionAccessor?.count) {
        vertexCount += positionAccessor.count;
      }
      if (positionAccessor?.min && positionAccessor.max) {
        for (let index = 0; index < 3; index += 1) {
          bbox.min[index] = Math.min(bbox.min[index], positionAccessor.min[index] ?? bbox.min[index]);
          bbox.max[index] = Math.max(bbox.max[index], positionAccessor.max[index] ?? bbox.max[index]);
        }
      }
      const indicesIndex = primitive.indices as number | undefined;
      const indexAccessor = typeof indicesIndex === "number" ? accessors[indicesIndex] : undefined;
      if (indexAccessor?.count) {
        triangleCount += Math.floor(indexAccessor.count / 3);
      } else if (positionAccessor?.count) {
        triangleCount += Math.floor(positionAccessor.count / 3);
      }
    }
  }

  const images = json.images ?? [];
  const missingTextureRefs = (json.textures ?? []).filter((texture) => {
    return typeof texture.source !== "number" || !images[texture.source];
  }).length;
  const materialTextureSlots = (json.materials ?? []).reduce((count, material) => {
    return count + countTextureSlots(material);
  }, 0);

  return {
    format,
    version: json.asset?.version,
    nodeCount: json.nodes?.length ?? 0,
    meshCount: json.meshes?.length ?? 0,
    materialCount: json.materials?.length ?? 0,
    textureCount: json.textures?.length ?? 0,
    imageCount: images.length,
    primitiveCount,
    vertexCount,
    triangleCount,
    primitivesMissingNormals,
    primitivesMissingUvs,
    missingTextureRefs,
    materialTextureSlots,
    boundingBox: Number.isFinite(bbox.min[0]) ? bbox : undefined
  };
}

function countTextureSlots(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0;
  }
  let count = 0;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key.endsWith("Texture") && nested && typeof nested === "object") {
      count += 1;
    }
    count += countTextureSlots(nested);
  }
  return count;
}
