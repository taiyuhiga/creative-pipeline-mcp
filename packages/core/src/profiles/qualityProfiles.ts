export type QualityProfileDomain = "premiere" | "blender";

export interface QualityProfile {
  id: string;
  domain: QualityProfileDomain;
  description: string;
  appliesTo: string[];
  settings: Record<string, unknown>;
  qcThresholds: Record<string, unknown>;
  expectedArtifacts: string[];
  experimental?: boolean;
}

export const qualityProfiles: QualityProfile[] = [
  {
    id: "master_prores_422_hq",
    domain: "premiere",
    description: "Mezzanine-quality ProRes 422 HQ master for archival or downstream transcode.",
    appliesTo: ["export_sequence", "finalize_export_qc"],
    settings: {
      container: "mov",
      codec: "prores_422_hq",
      chroma: "4:2:2",
      targetLufs: -14
    },
    qcThresholds: {
      targetLufs: -14,
      loudnessToleranceLufs: 1.5,
      maxTruePeakDb: -1,
      minVmaf: 95
    },
    expectedArtifacts: [
      "export_plan",
      "master_video",
      "delivery_qc_report"
    ],
    experimental: true
  },
  {
    id: "youtube_4k_high_quality",
    domain: "premiere",
    description: "High-quality YouTube H.264 export with VMAF and loudness checks when available.",
    appliesTo: ["export_video", "run_delivery_qc", "finalize_export_qc"],
    settings: {
      container: "mp4",
      codec: "h264",
      width: 3840,
      height: 2160,
      bitrate: "high",
      targetLufs: -14
    },
    qcThresholds: {
      minWidth: 3840,
      minHeight: 2160,
      targetLufs: -14,
      loudnessToleranceLufs: 2,
      minVmaf: 92
    },
    expectedArtifacts: [
      "export_plan",
      "delivery_qc_report"
    ]
  },
  {
    id: "shorts_1080x1920_high_quality",
    domain: "premiere",
    description: "Vertical high-quality social export with caption safe-area checks.",
    appliesTo: ["export_video", "validate_subtitles", "run_delivery_qc"],
    settings: {
      container: "mp4",
      codec: "h264",
      width: 1080,
      height: 1920,
      bitrate: "high",
      targetLufs: -14
    },
    qcThresholds: {
      minWidth: 1080,
      minHeight: 1920,
      maxDurationSeconds: 60,
      captionMaxLines: 2,
      captionBottomClearance: 0.14
    },
    expectedArtifacts: [
      "caption_qc_report",
      "delivery_qc_report"
    ]
  },
  {
    id: "game_ready_glb",
    domain: "blender",
    description: "Game-ready GLB quality bar for optimized engine handoff.",
    appliesTo: ["validate_asset", "optimize_asset", "export_game_ready"],
    settings: {
      format: "glb",
      requireOptimization: true,
      requirePreview: true
    },
    qcThresholds: {
      maxTriangles: 50000,
      maxMaterials: 8,
      requirePrimaryUv: true,
      requireNormals: true
    },
    expectedArtifacts: [
      "optimized_glb",
      "preview_png",
      "asset_qc_report"
    ]
  },
  {
    id: "usd_vfx_handoff",
    domain: "blender",
    description: "USD/VFX handoff quality bar with explicit experimental status.",
    appliesTo: ["create_usd_pipeline", "validate_asset"],
    settings: {
      format: "usd",
      requireSceneScale: true,
      requireMaterialReview: true
    },
    qcThresholds: {
      requireReadableNames: true,
      requireResolvedTextures: true,
      requireCamera: false
    },
    expectedArtifacts: [
      "usd_manifest",
      "asset_qc_report"
    ],
    experimental: true
  },
  {
    id: "cycles_final_exr",
    domain: "blender",
    description: "Final Cycles EXR quality bar for high-resolution render review.",
    appliesTo: ["render_preview"],
    settings: {
      renderer: "cycles",
      imageFormat: "exr",
      samples: 512,
      colorManagement: "scene_linear"
    },
    qcThresholds: {
      requireCamera: true,
      requireLighting: true,
      requireResolvedTextures: true
    },
    expectedArtifacts: [
      "final_exr",
      "preview_png",
      "asset_qc_report"
    ],
    experimental: true
  }
];

export function getQualityProfile(id: string): QualityProfile | undefined {
  return qualityProfiles.find((profile) => profile.id === id);
}
