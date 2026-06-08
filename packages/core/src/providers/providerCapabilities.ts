export type ProviderDomain = "video_editor" | "motion_engine" | "game_engine";

export type ProviderStability = "stable" | "experimental" | "reference_only";

export interface ProviderCapabilitySpec {
  id: string;
  label: string;
  domain: ProviderDomain;
  stability: ProviderStability;
  preferredFor: string[];
  commands?: string[];
  env?: string[];
  risks: string[];
  safeOperations: string[];
  blockedOperations: string[];
  notes: string[];
}

export const providerCapabilities: ProviderCapabilitySpec[] = [
  {
    id: "premiere",
    label: "Adobe Premiere Pro CEP",
    domain: "video_editor",
    stability: "experimental",
    preferredFor: ["long_form_edit", "delivery_qc", "brand_package", "export_qc"],
    commands: [],
    env: ["CREATIVE_MCP_PREMIERE_CEP_QUEUE_DIR"],
    risks: ["timeline mutation", "project file mutation", "export side effects"],
    safeOperations: ["media_qc", "delivery_qc", "typed_cep_queue", "status_json"],
    blockedOperations: ["raw_extendscript_proxy", "qe_dom_unbounded_proxy"],
    notes: ["Live CEP editing remains experimental until full platform evidence is available."]
  },
  {
    id: "capcut",
    label: "CapCut Social Adapter",
    domain: "video_editor",
    stability: "experimental",
    preferredFor: ["short_form_social", "template_draft", "captioned_social_delivery"],
    commands: ["capcut", "capcut-cli", "cut_cli"],
    env: ["CREATIVE_MCP_CAPCUT_API_URL", "CREATIVE_MCP_CAPCUT_MATE_URL"],
    risks: ["cloud upload", "draft overwrite", "unofficial adapter drift"],
    safeOperations: ["availability", "draft_plan", "copy_on_write_manifest", "draft_qc"],
    blockedOperations: ["encrypted_draft_bypass", "binary_modification", "raw_draft_overwrite"],
    notes: ["CapCut integration is a provider fallback, not a raw API proxy."]
  },
  {
    id: "after_effects",
    label: "After Effects Render Provider",
    domain: "motion_engine",
    stability: "experimental",
    preferredFor: ["motion_package", "template_render", "frame_preview"],
    commands: ["aerender", "nexrender"],
    env: ["AERENDER_BIN", "NEXRENDER_BIN", "CREATIVE_MCP_AE_RENDER_ROOT"],
    risks: ["render queue mutation", "template side effects", "license availability"],
    safeOperations: ["render_plan", "aerender_queue_manifest", "nexrender_job_manifest", "motion_qc"],
    blockedOperations: ["raw_jsx_default", "license_bypass", "template_overwrite"],
    notes: ["Phase 1 is render-only and artifact-first."]
  },
  {
    id: "blender_motion",
    label: "Blender Motion/Preview",
    domain: "motion_engine",
    stability: "experimental",
    preferredFor: ["3d_preview", "asset_animation", "safe_script_render"],
    commands: ["blender"],
    env: ["BLENDER_BIN"],
    risks: ["safe script execution", "render resource usage"],
    safeOperations: ["safe_script_queue", "preview_render", "asset_qc"],
    blockedOperations: ["raw_bpy_proxy"],
    notes: ["Use the existing Blender QC and bridge tools before external adapters."]
  },
  {
    id: "roblox_studio",
    label: "Roblox Studio / Rojo",
    domain: "game_engine",
    stability: "experimental",
    preferredFor: ["roblox_project_qc", "rojo_sync_plan", "luau_index"],
    commands: ["rojo", "wally", "selene", "stylua"],
    env: ["ROBLOX_STUDIO_MCP_URL", "CREATIVE_MCP_ENABLE_ROBLOX_COMMANDS"],
    risks: ["place mutation", "asset publishing", "third-party package install"],
    safeOperations: ["read_only_project_inspection", "script_index", "luau_qc", "command_manifest"],
    blockedOperations: ["executor_tools", "client_exploit_tools", "raw_studio_proxy", "place_publish_default"],
    notes: ["Phase 1 is read-only/QC. Official Roblox Studio MCP is preferred for future write operations."]
  }
];

export function providersForDomain(domain: ProviderDomain): ProviderCapabilitySpec[] {
  return providerCapabilities.filter((provider) => provider.domain === domain);
}

export function getProviderCapability(id: string): ProviderCapabilitySpec | undefined {
  return providerCapabilities.find((provider) => provider.id === id);
}
