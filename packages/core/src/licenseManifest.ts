import type { LicenseEntry } from "./types.js";

export class LicenseManifest {
  private readonly entries = new Map<string, LicenseEntry>();

  add(entry: LicenseEntry): void {
    this.entries.set(entry.name, entry);
  }

  list(): LicenseEntry[] {
    return [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function defaultLicenseManifest(): LicenseManifest {
  const manifest = new LicenseManifest();
  manifest.add({
    name: "3D-Agent",
    license: "Commercial/proprietary terms",
    role: "Excluded from this repository",
    integration: "reference_only",
    url: "https://3d-agent.ai/"
  });
  manifest.add({
    name: "BlenderProc",
    license: "GPL-3.0",
    role: "Optional external adapter only",
    integration: "optional_external",
    url: "https://github.com/DLR-RM/BlenderProc"
  });
  manifest.add({
    name: "BlenderGIS",
    license: "GPL-3.0",
    role: "Optional external Blender addon adapter only",
    integration: "optional_external",
    url: "https://github.com/domlysz/BlenderGIS"
  });
  manifest.add({
    name: "Sverchok",
    license: "GPL-3.0",
    role: "Optional external Blender addon adapter only",
    integration: "optional_external",
    url: "https://github.com/nortikin/sverchok"
  });
  return manifest;
}

