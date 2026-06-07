export type DeliveryProfileDomain = "premiere" | "blender";

export interface DeliveryProfile {
  id: string;
  domain: DeliveryProfileDomain;
  description: string;
  output: Record<string, unknown>;
  qcThresholds: Record<string, unknown>;
  artifactNaming: Record<string, string>;
  expectedOutputs: string[];
  experimental?: boolean;
}

export const deliveryProfiles: DeliveryProfile[] = [
  {
    id: "youtube_4k_high_quality",
    domain: "premiere",
    description: "High-quality 16:9 YouTube master with delivery QC.",
    output: {
      container: "mp4",
      codec: "h264",
      width: 3840,
      height: 2160,
      fps: 30,
      targetLufs: -14,
      preset: "youtube_4k_h264_high_quality"
    },
    qcThresholds: {
      maxDurationSeconds: 7200,
      minWidth: 3840,
      minHeight: 2160,
      targetLufs: -14,
      loudnessToleranceLufs: 2,
      minVmaf: 92
    },
    artifactNaming: {
      exportPlan: "premiere/{stem}_youtube_4k_export_plan.json",
      deliveryQc: "premiere/{stem}_youtube_4k_delivery_qc_report.json",
      final: "premiere/{stem}_youtube_4k.mp4"
    },
    expectedOutputs: [
      "export_plan",
      "final_video",
      "delivery_qc_report"
    ]
  },
  {
    id: "shorts_1080x1920_high_quality",
    domain: "premiere",
    description: "Vertical Shorts/Reels/TikTok delivery with caption-safe QC.",
    output: {
      container: "mp4",
      codec: "h264",
      width: 1080,
      height: 1920,
      fps: 30,
      targetLufs: -14,
      preset: "vertical_1080_h264_high_quality"
    },
    qcThresholds: {
      maxDurationSeconds: 60,
      minWidth: 1080,
      minHeight: 1920,
      targetLufs: -14,
      loudnessToleranceLufs: 2,
      captionBottomClearance: 0.14
    },
    artifactNaming: {
      exportPlan: "premiere/{stem}_shorts_export_plan.json",
      deliveryQc: "premiere/{stem}_shorts_delivery_qc_report.json",
      final: "premiere/{stem}_shorts.mp4"
    },
    expectedOutputs: [
      "export_plan",
      "final_video",
      "delivery_qc_report",
      "caption_qc_report"
    ]
  },
  {
    id: "podcast_video_clean_audio",
    domain: "premiere",
    description: "Podcast video delivery prioritizing stable loudness and clean speech.",
    output: {
      container: "mp4",
      codec: "h264",
      width: 1920,
      height: 1080,
      fps: 30,
      targetLufs: -16,
      preset: "podcast_1080_h264_clean_audio"
    },
    qcThresholds: {
      minWidth: 1920,
      minHeight: 1080,
      targetLufs: -16,
      loudnessToleranceLufs: 1.5,
      maxTruePeakDb: -1
    },
    artifactNaming: {
      exportPlan: "premiere/{stem}_podcast_export_plan.json",
      deliveryQc: "premiere/{stem}_podcast_delivery_qc_report.json",
      final: "premiere/{stem}_podcast.mp4"
    },
    expectedOutputs: [
      "export_plan",
      "final_video",
      "delivery_qc_report",
      "loudness_report"
    ]
  },
  {
    id: "captioned_social_delivery",
    domain: "premiere",
    description: "Social delivery profile with caption validation as a required output.",
    output: {
      container: "mp4",
      codec: "h264",
      width: 1080,
      height: 1920,
      fps: 30,
      targetLufs: -14,
      captions: "required"
    },
    qcThresholds: {
      maxDurationSeconds: 90,
      targetLufs: -14,
      loudnessToleranceLufs: 2,
      captionMaxLines: 2,
      captionBottomClearance: 0.14
    },
    artifactNaming: {
      captions: "premiere/{stem}_captions.srt",
      captionQc: "premiere/{stem}_caption_qc_report.json",
      final: "premiere/{stem}_captioned_social.mp4"
    },
    expectedOutputs: [
      "captions",
      "caption_qc_report",
      "final_video",
      "delivery_qc_report"
    ]
  },
  {
    id: "game_ready_glb",
    domain: "blender",
    description: "Game-ready GLB handoff with optimization and asset QC.",
    output: {
      format: "glb",
      target: "game_engine",
      textureFormat: "webp_or_png",
      unitScale: "meters"
    },
    qcThresholds: {
      maxTriangles: 50000,
      maxMaterials: 8,
      requirePrimaryUv: true,
      requireNormals: true,
      maxDimensionMeters: 10
    },
    artifactNaming: {
      source: "blender/{stem}.glb",
      optimized: "blender/{stem}_optimized.glb",
      preview: "blender/{stem}_preview.png",
      assetQc: "blender/{stem}_asset_qc_report.json"
    },
    expectedOutputs: [
      "source_glb",
      "optimized_glb",
      "preview_png",
      "asset_qc_report"
    ]
  },
  {
    id: "marketplace_asset",
    domain: "blender",
    description: "Marketplace asset package profile with preview, optimized asset, and QC report.",
    output: {
      format: "glb",
      target: "marketplace",
      previewRequired: true,
      licenseManifestRequired: true
    },
    qcThresholds: {
      maxTriangles: 100000,
      maxMaterials: 16,
      requirePrimaryUv: true,
      requireTexturesResolved: true,
      requireReadableNames: true
    },
    artifactNaming: {
      package: "blender/{stem}_marketplace_package.json",
      optimized: "blender/{stem}_marketplace.glb",
      preview: "blender/{stem}_marketplace_preview.png",
      assetQc: "blender/{stem}_marketplace_qc_report.json"
    },
    expectedOutputs: [
      "marketplace_manifest",
      "optimized_glb",
      "preview_png",
      "asset_qc_report",
      "license_manifest"
    ]
  },
  {
    id: "cycles_high_quality_preview",
    domain: "blender",
    description: "High-quality Cycles preview render for review and approval.",
    output: {
      renderer: "cycles",
      imageFormat: "png",
      width: 1920,
      height: 1080,
      samples: 128
    },
    qcThresholds: {
      requireCamera: true,
      requireLighting: true,
      requireResolvedTextures: true
    },
    artifactNaming: {
      preview: "blender/{stem}_cycles_preview.png",
      assetQc: "blender/{stem}_cycles_preview_qc_report.json"
    },
    expectedOutputs: [
      "preview_png",
      "asset_qc_report"
    ]
  },
  {
    id: "cycles_final_exr",
    domain: "blender",
    description: "Final Cycles EXR handoff profile for VFX review.",
    output: {
      renderer: "cycles",
      imageFormat: "exr",
      width: 3840,
      height: 2160,
      samples: 512,
      colorManagement: "scene_linear"
    },
    qcThresholds: {
      requireCamera: true,
      requireLighting: true,
      requireResolvedTextures: true,
      requireOutputPath: true
    },
    artifactNaming: {
      final: "blender/{stem}_cycles_final.exr",
      preview: "blender/{stem}_cycles_final_preview.png",
      assetQc: "blender/{stem}_cycles_final_qc_report.json"
    },
    expectedOutputs: [
      "final_exr",
      "preview_png",
      "asset_qc_report"
    ],
    experimental: true
  }
];

export function getDeliveryProfile(id: string): DeliveryProfile | undefined {
  return deliveryProfiles.find((profile) => profile.id === id);
}
