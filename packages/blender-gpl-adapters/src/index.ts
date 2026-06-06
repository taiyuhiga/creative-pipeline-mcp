export interface ExternalGplAdapterJob {
  adapter: "blenderproc" | "blendergis" | "sverchok";
  command: string;
  args: string[];
  inputJson: Record<string, unknown>;
  license: "GPL-3.0-or-later";
}

export function createBlenderProcJob(inputJson: Record<string, unknown>): ExternalGplAdapterJob {
  return {
    adapter: "blenderproc",
    command: "blenderproc",
    args: ["run", "--custom-blender-path", "${BLENDER_PATH}", "${SCRIPT_PATH}"],
    inputJson,
    license: "GPL-3.0-or-later"
  };
}

export function createBlenderGisJob(inputJson: Record<string, unknown>): ExternalGplAdapterJob {
  return {
    adapter: "blendergis",
    command: "blender",
    args: ["--background", "--python", "${BLENDERGIS_BRIDGE_SCRIPT}"],
    inputJson,
    license: "GPL-3.0-or-later"
  };
}

export function createSverchokJob(inputJson: Record<string, unknown>): ExternalGplAdapterJob {
  return {
    adapter: "sverchok",
    command: "blender",
    args: ["--background", "--python", "${SVERCHOK_BRIDGE_SCRIPT}"],
    inputJson,
    license: "GPL-3.0-or-later"
  };
}

