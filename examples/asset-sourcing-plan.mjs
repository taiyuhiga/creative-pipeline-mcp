import {
  ApprovalPolicy,
  ArtifactStore,
  defaultLicenseManifest
} from "../packages/core/dist/index.js";
import { assetTools } from "../packages/asset-sourcing/dist/index.js";

const root = new URL("../artifacts/examples/asset-sourcing", import.meta.url).pathname;
const context = {
  artifactStore: new ArtifactStore(root, process.cwd()),
  approvalPolicy: new ApprovalPolicy("safe_write"),
  licenseManifest: defaultLicenseManifest(),
  logger: { log() {} }
};

const tool = assetTools.find((candidate) => candidate.name === "asset.acquire_or_generate");
if (!tool) throw new Error("asset.acquire_or_generate not registered");

const result = await tool.execute(context, {
  prompt: "modern wooden dining chair",
  intent: "generic_furniture",
  policy: "fallback_only",
  maxCandidates: 4
});

console.log(JSON.stringify(result, null, 2));
