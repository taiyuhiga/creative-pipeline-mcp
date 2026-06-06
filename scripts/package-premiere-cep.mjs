#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const root = process.cwd();
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = rootPackage.version;
const cepVersion = version.replace(/-.*/, "");
const sourceDir = resolve(root, "packages", "premiere-cep-panel");
const outDir = resolve(root, "dist", "premiere-cep");
const extensionId = "creative.pipeline.mcp.panel";
const bundleId = "creative.pipeline.mcp";
const packageName = `creative-pipeline-mcp-premiere-cep-panel-${version}`;
const unsignedZip = join(outDir, `${packageName}.zip`);
const checksumsPath = join(outDir, "premiere-cep-checksums.txt");

const args = new Set(process.argv.slice(2));
const sign = args.has("--sign");
const verify = args.has("--verify") || sign;

validatePanel();
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeZip(unsignedZip, collectPanelFiles());

const outputs = [unsignedZip];
if (sign) {
  outputs.push(signPackage());
}
if (verify) {
  for (const output of outputs) {
    verifyPackage(output);
  }
}

writeFileSync(
  checksumsPath,
  outputs.map((output) => `${sha256(output)}  ${basename(output)}`).join("\n") + "\n",
  "utf8"
);

console.log(JSON.stringify({
  ok: true,
  version,
  cepVersion,
  outDir,
  package: unsignedZip,
  signedPackage: outputs.find((output) => output.endsWith(".zxp")) ?? null,
  checksums: checksumsPath
}, null, 2));

function validatePanel() {
  const requiredFiles = [
    "CSXS/manifest.xml",
    "README.md",
    "index.html",
    "js/main.js",
    "jsx/host.jsx",
    "package.json"
  ];
  for (const file of requiredFiles) {
    const path = join(sourceDir, file);
    if (!existsSync(path)) {
      throw new Error(`Premiere CEP panel missing required file: ${file}`);
    }
  }

  const panelPackage = JSON.parse(readFileSync(join(sourceDir, "package.json"), "utf8"));
  if (panelPackage.version !== version) {
    throw new Error(`Premiere CEP panel package version ${panelPackage.version} does not match root ${version}`);
  }

  const manifest = readFileSync(join(sourceDir, "CSXS", "manifest.xml"), "utf8");
  assertManifestAttribute(manifest, "ExtensionBundleId", bundleId);
  assertManifestAttribute(manifest, "ExtensionBundleVersion", cepVersion);
  if (!manifest.includes(`<Extension Id="${extensionId}" Version="${cepVersion}"`)) {
    throw new Error(`CEP manifest extension id/version must be ${extensionId}@${cepVersion}`);
  }
  if (!manifest.includes("<Host Name=\"PPRO\"")) {
    throw new Error("CEP manifest must declare Premiere Pro host PPRO");
  }
}

function assertManifestAttribute(manifest, name, expected) {
  const match = manifest.match(new RegExp(`${name}="([^"]+)"`));
  if (!match || match[1] !== expected) {
    throw new Error(`CEP manifest ${name} must be ${expected}`);
  }
}

function collectPanelFiles() {
  return walk(sourceDir)
    .filter((path) => {
      const name = basename(path);
      return name !== ".DS_Store" && name !== "package-lock.json" && !path.includes(`${sepForPath()}node_modules${sepForPath()}`);
    })
    .map((path) => ({ path, name: relative(sourceDir, path).replaceAll("\\", "/") }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function signPackage() {
  const signCmd = process.env.ZXPSIGNCMD_BIN ?? "ZXPSignCmd";
  const cert = process.env.CEP_SIGN_CERT;
  const password = process.env.CEP_SIGN_PASSWORD;
  if (!cert || !password) {
    throw new Error("Set CEP_SIGN_CERT and CEP_SIGN_PASSWORD to sign the CEP package");
  }
  const signed = join(outDir, `${packageName}.zxp`);
  const result = spawnSync(signCmd, ["-sign", sourceDir, signed, cert, password], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`ZXPSignCmd signing failed:\n${result.stdout}\n${result.stderr}`);
  }
  return signed;
}

function verifyPackage(path) {
  if (extname(path) === ".zip") {
    const result = spawnSync("unzip", ["-t", path], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`ZIP verification failed for ${path}:\n${result.stdout}\n${result.stderr}`);
    }
    return;
  }

  const signCmd = process.env.ZXPSIGNCMD_BIN ?? "ZXPSignCmd";
  const result = spawnSync(signCmd, ["-verify", path], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`ZXPSignCmd verification failed for ${path}:\n${result.stdout}\n${result.stderr}`);
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeZip(output, files) {
  let offset = 0;
  const localRecords = [];
  const centralRecords = [];
  const crcTable = makeCrcTable();
  for (const file of files) {
    const data = readFileSync(file.path);
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(data, crcTable);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localRecords.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralRecords.push(central, name);
    offset += local.length + name.length + data.length;
  }

  const centralStart = offset;
  const centralSize = centralRecords.reduce((sum, buffer) => sum + buffer.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  writeFileSync(output, Buffer.concat([...localRecords, ...centralRecords, end]));
}

function crc32(data, crcTable) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

function sepForPath() {
  return process.platform === "win32" ? "\\" : "/";
}
