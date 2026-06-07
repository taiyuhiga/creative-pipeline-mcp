import { dirname, join } from "node:path";
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
  missingImageFiles: number;
  externalTextureBytes: number;
  imagesWithDimensions: number;
  oversizedImages: number;
  incompletePbrMaterials: number;
  unnamedNodes: number;
  invalidNodeNames: number;
  boundingBox?: { min: number[]; max: number[] };
  boundingBoxSize?: number[];
}

interface GltfJson {
  asset?: { version?: string };
  nodes?: Array<{ name?: string }>;
  meshes?: Array<{ primitives?: Array<Record<string, unknown>> }>;
  accessors?: Array<{ count?: number; min?: number[]; max?: number[] }>;
  materials?: Array<Record<string, unknown>>;
  textures?: Array<{ source?: number }>;
  images?: Array<{ uri?: string; bufferView?: number; mimeType?: string; name?: string }>;
}

export async function inspectGltf(path: string): Promise<GltfInspection> {
  const bytes = await readFile(path);
  const json = path.toLowerCase().endsWith(".glb") ? readGlbJson(bytes) : JSON.parse(bytes.toString("utf8"));
  return summarize(json, path.toLowerCase().endsWith(".glb") ? "glb" : "gltf", path);
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

async function summarize(json: GltfJson, format: "glb" | "gltf", path: string): Promise<GltfInspection> {
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
  const imageInspection = await inspectImages(path, images);
  const materialTextureSlots = (json.materials ?? []).reduce((count, material) => {
    return count + countTextureSlots(material);
  }, 0);
  const incompletePbrMaterials = (json.materials ?? []).filter((material) => !hasPbrMaterial(material)).length;
  const nodes = json.nodes ?? [];
  const unnamedNodes = nodes.filter((node) => !node.name).length;
  const invalidNodeNames = nodes.filter((node) => node.name && !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(node.name)).length;
  const boundingBox = Number.isFinite(bbox.min[0]) ? bbox : undefined;

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
    missingImageFiles: imageInspection.missingImageFiles,
    externalTextureBytes: imageInspection.externalTextureBytes,
    imagesWithDimensions: imageInspection.imagesWithDimensions,
    oversizedImages: imageInspection.oversizedImages,
    incompletePbrMaterials,
    unnamedNodes,
    invalidNodeNames,
    boundingBox,
    boundingBoxSize: boundingBox
      ? boundingBox.max.map((max, index) => max - boundingBox.min[index])
      : undefined
  };
}

async function inspectImages(path: string, images: NonNullable<GltfJson["images"]>) {
  let missingImageFiles = 0;
  let externalTextureBytes = 0;
  let imagesWithDimensions = 0;
  let oversizedImages = 0;
  for (const image of images) {
    if (!image.uri || image.uri.startsWith("data:") || image.bufferView !== undefined) {
      continue;
    }
    const imagePath = join(dirname(path), decodeURIComponent(image.uri));
    let bytes: Buffer;
    try {
      bytes = await readFile(imagePath);
    } catch {
      missingImageFiles += 1;
      continue;
    }
    externalTextureBytes += bytes.length;
    const dimensions = readImageDimensions(bytes);
    if (dimensions) {
      imagesWithDimensions += 1;
      if (dimensions.width > 4096 || dimensions.height > 4096) {
        oversizedImages += 1;
      }
    }
  }
  return { missingImageFiles, externalTextureBytes, imagesWithDimensions, oversizedImages };
}

function readImageDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length >= 24 && bytes.toString("ascii", 1, 4) === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return undefined;
}

function hasPbrMaterial(material: Record<string, unknown>): boolean {
  const pbr = material.pbrMetallicRoughness;
  if (!pbr || typeof pbr !== "object") {
    return false;
  }
  const value = pbr as Record<string, unknown>;
  return Boolean(value.baseColorFactor || value.baseColorTexture || value.metallicRoughnessTexture);
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
