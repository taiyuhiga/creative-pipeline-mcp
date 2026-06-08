# API Tools

The public alpha tool schemas are intentionally strict. Unknown top-level input properties are rejected before execution.

## Core

- `core.health`
- `core.license_manifest`

## Asset Sourcing

- `asset.resolve_source_plan`
- `asset.search_candidates`
- `asset.acquire_asset`
- `asset.generate_3d`
- `asset.postprocess_generated_asset`
- `asset.finalize_asset`
- `asset.write_provenance`
- `asset.acquire_or_generate`

## Blender

- `blender.read_bridge_status`
- `blender.await_bridge_status`
- `blender.external_adapter_health`
- `blender.external_import_asset`
- `blender.external_render_preview`
- `blender.external_export_asset`
- `blender.external_apply_transform`
- `blender.external_validate_scene`
- `blender.create_scene`
- `blender.apply_material`
- `blender.modify_asset`
- `blender.create_asset`
- `blender.inspect_scene`
- `blender.configure_engine_profile`
- `blender.create_usd_pipeline`
- `blender.create_materialx_workflow`
- `blender.plan_rig_animation`
- `blender.validate_asset`
- `blender.render_preview`
- `blender.optimize_asset`
- `blender.export_game_ready`
- `blender.create_game_asset`
- `blender.create_material_pack`
- `blender.fix_asset_issues`
- `blender.repair_basic_asset`

## Premiere

- `premiere.read_cep_status`
- `premiere.await_cep_status`
- `premiere.transcribe_media`
- `premiere.detect_scenes`
- `premiere.measure_loudness`
- `premiere.measure_vmaf`
- `premiere.build_timeline_from_otio`
- `premiere.ingest_media`
- `premiere.index_media`
- `premiere.run_delivery_qc`
- `premiere.make_rough_cut`
- `premiere.build_project_delivery`
- `premiere.auto_caption`
- `premiere.mix_audio`
- `premiere.export_video`
- `premiere.finalize_export_qc`
- `premiere.export_social_variants`
- `premiere.apply_brand_package`
- `premiere.apply_timeline_markers`
- `premiere.trim_clip`
- `premiere.split_clip`
- `premiere.move_clip`
- `premiere.add_marker`
- `premiere.set_clip_speed`
- `premiere.validate_subtitles`
- `premiere.cleanup_subtitles`
- `premiere.watch_export_output`
- `premiere.describe_subtitle_artifacts`
- `premiere.create_multilanguage_subtitles`
- `premiere.generate_thumbnail_plan`
- `premiere.repurpose_podcast`
- `premiere.fix_qc_issues`

## Director

- `director.plan_production`
- `director.handoff_blender_asset`
- `director.full_production_report`
- `director.multi_agent_review`

## Stability

Alpha schemas may still change. The intended v1 freeze covers:

- tool names
- required fields
- output `structuredContent`
- QC report schema
- CEP status schema
- artifact layout

Schema snapshot:

- `docs/API_TOOL_SCHEMAS.snapshot.json`

Run:

```bash
npm run build
npm run check:schemas
```
