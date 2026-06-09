# API Tools

The public tool schemas are intentionally strict. Unknown top-level input properties are rejected before execution. Post-v1 alpha tools remain experimental unless marked stable in `docs/V1_SCOPE.md`.

## Core

- `core.health`
- `core.license_manifest`

## Provider Registry

- `provider.check_availability`
- `provider.resolve_video_editor`
- `provider.resolve_motion_engine`
- `provider.resolve_game_engine`
- `provider.write_provider_report`

## Asset Sourcing

- `asset.resolve_source_plan`
- `asset.search_candidates`
- `asset.acquire_asset`
- `asset.generate_3d`
- `asset.ingest_generated_result`
- `asset.postprocess_generated_asset`
- `asset.finalize_asset`
- `asset.write_provenance`
- `asset.evaluate_license_policy`
- `asset.write_asset_sbom`
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
- `premiere.create_sequence`
- `premiere.import_media_once`
- `premiere.insert_clip_at_time`
- `premiere.overwrite_clip_at_time`
- `premiere.replace_clip_media`
- `premiere.ripple_delete_with_approval`
- `premiere.add_transition`
- `premiere.apply_effect_preset`
- `premiere.apply_lumetri_preset`
- `premiere.set_audio_gain`
- `premiere.apply_audio_preset`
- `premiere.create_caption_track`
- `premiere.render_preview_range`
- `premiere.export_with_preset`
- `premiere.validate_subtitles`
- `premiere.cleanup_subtitles`
- `premiere.watch_export_output`
- `premiere.describe_subtitle_artifacts`
- `premiere.create_multilanguage_subtitles`
- `premiere.generate_thumbnail_plan`
- `premiere.repurpose_podcast`
- `premiere.fix_qc_issues`

Premiere live edit tools are bounded typed CEP queue commands. They write
`creative.pipeline.premiere.typed_edit.v1` artifacts under
`premiere/typed_edits/`, include idempotency/status/rollback metadata in the
queued command, require approval by default, and do not expose raw ExtendScript
or QE DOM proxy tools.

## CapCut

- `capcut.check_availability`
- `capcut.create_draft_plan`
- `capcut.write_draft_manifest`
- `capcut.run_draft_qc`
- `capcut.create_social_draft`
- `capcut.resolve_adapter`
- `capcut.export_draft_package`
- `capcut.run_delivery_qc`

## After Effects

- `ae.check_availability`
- `ae.create_render_plan`
- `ae.queue_aerender`
- `ae.queue_nexrender`
- `ae.render_frame_preview`
- `ae.run_motion_qc`
- `ae.collect_render_evidence`
- `ae.prepare_render_execution`
- `ae.run_approved_render`
- `ae.prepare_template_replacements`
- `ae.prepare_file_bridge`

## Roblox

- `roblox.check_availability`
- `roblox.inspect_project`
- `roblox.inspect_place_tree`
- `roblox.index_scripts`
- `roblox.validate_luau_project`
- `roblox.collect_studio_evidence`
- `roblox.prepare_studio_mcp_session`
- `roblox.prepare_studio_operation`
- `roblox.collect_playtest_report`
- `roblox.prepare_weppy_provider`
- `roblox.sync_rojo`
- `roblox.run_wally_install`
- `roblox.run_selene`
- `roblox.run_stylua_check`
- `roblox.generate_project_report`

## Director

- `director.plan_production`
- `director.handoff_blender_asset`
- `director.full_production_report`
- `director.multi_agent_review`
- `director.create_social_video`
- `video.create_edit`
- `director.create_motion_package`
- `director.build_roblox_feature`
- `director.create_roblox_trailer`

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
