import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";

export class ArtifactStore {
  public readonly root: string;

  constructor(root = process.env.CREATIVE_MCP_ARTIFACTS ?? "artifacts") {
    this.root = resolve(root);
  }

  async writeJson(relativePath: string, value: unknown): Promise<string> {
    return this.writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async writeText(relativePath: string, value: string): Promise<string> {
    const target = this.resolveSafe(relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value, "utf8");
    return target;
  }

  async writeBytes(relativePath: string, value: Uint8Array): Promise<string> {
    const target = this.resolveSafe(relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value);
    return target;
  }

  async copyIn(sourcePath: string, relativePath: string): Promise<string> {
    const target = this.resolveSafe(relativePath || basename(sourcePath));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(sourcePath, target);
    return target;
  }

  private resolveSafe(relativePath: string): string {
    if (isAbsolute(relativePath)) {
      throw new Error("Artifact paths must be relative");
    }
    const target = normalize(join(this.root, relativePath));
    if (!target.startsWith(this.root)) {
      throw new Error(`Unsafe artifact path: ${relativePath}`);
    }
    return target;
  }
}

