# CapCut Provider

CapCut is registered as a `video_editor` provider with short-form social delivery as its main use case.

## Preferred Use

- Shorts/Reels/TikTok-style draft planning
- captioned social delivery
- Premiere-unavailable fallback
- artifact-only draft handoff for human review
- env-gated approved CLI adapter execution after copy-on-write manifest review

## Not Supported

- raw draft mutation
- encrypted draft reverse engineering
- direct cloud upload without approval
- raw cloud or GUI adapter execution
- replacing Premiere as the stable v1 delivery surface

## Director Integration

`director.create_social_video` may include `capcut.create_social_draft` as the fallback stage after `provider.resolve_video_editor`.
