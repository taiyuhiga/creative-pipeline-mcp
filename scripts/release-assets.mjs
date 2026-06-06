import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const outDir = resolve(root, "dist", "release");
const crcTable = makeCrcTable();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const pack = spawnSync("npm", ["pack", "--pack-destination", outDir], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"]
});
if (pack.status !== 0) {
  throw new Error("npm pack failed");
}

const tgz = join(outDir, pack.stdout.trim().split(/\s+/).at(-1));
const exampleZip = join(outDir, `creative-pipeline-mcp-example-artifacts-${version}.zip`);
writeZip(exampleZip, collectExampleFiles());

const assets = [tgz, exampleZip];
const checksums = assets
  .map((asset) => `${sha256(asset)}  ${basename(asset)}`)
  .join("\n");
const checksumPath = join(outDir, "checksums.txt");
writeFileSync(checksumPath, `${checksums}\n`, "utf8");

console.log(JSON.stringify({
  version,
  outDir,
  assets: [...assets, checksumPath]
}, null, 2));

function collectExampleFiles() {
  const baseDirs = ["docs/examples", "examples"];
  const files = [];
  for (const baseDir of baseDirs) {
    const absolute = join(root, baseDir);
    for (const file of walk(absolute)) {
      files.push({ path: file, name: relative(root, file).replaceAll("\\", "/") });
    }
  }
  return files;
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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeZip(output, files) {
  let offset = 0;
  const localRecords = [];
  const centralRecords = [];
  for (const file of files) {
    const data = readFileSync(file.path);
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(data);
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

function crc32(data) {
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
