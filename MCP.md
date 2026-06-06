はい、発想はかなり強いです。
**Blender用とPremiere用に、それぞれ“統合MCP”を作れば、かなりプロ制作パイプライン寄りのものは作れます。**

ただし、ベストは **「既存OSSを全部1つの巨大コードに混ぜる」ではなく、1つのMCPから複数OSSを“モジュール/アダプタ”として呼ぶ構成**です。

つまりこうです。

```text
悪い統合:
  既存MCPやOSSを全部コピペして巨大な1本のMCPにする

良い統合:
  1つのMCPサーバー
  + ルーター
  + プラグイン/アダプタ層
  + 検証/QC層
  + 必要なtoolだけAIに見せる
```

これなら、**AIが迷わない・壊しにくい・ライセンス管理しやすい・プロ品質チェックを入れられる**ので、本当に実用レベルに近づきます。

---

# 結論：作るなら2本立てがいい

おすすめはこれです。

```text
Blender Pro MCP
  3D制作・アセット生成・マテリアル・レンダー・最適化・検証

Premiere Pro MCP
  素材解析・ラフカット・字幕・音声・タイムライン編集・書き出しQC
```

さらに上に、全体を指揮する **Creative Pipeline MCP / Director Agent** を置くと最強です。

```text
Director Agent
  ↓
Blender Pro MCP
  ↓
3Dモデル / レンダー / GLB / USD / EXR

Director Agent
  ↓
Premiere Pro MCP
  ↓
編集 / 字幕 / 音声 / 書き出し / QC
```

---

# 1. Blender用：Blender Pro MCP構想

Blender側は、**PatrykIti型を中核にするのが一番いい**です。
理由は、PatrykItiの `blender-ai-mcp` が、場当たり的にAIへ `bpy` を書かせるのではなく、**goal-first routing、curated tools、deterministic inspection、verification** を重視しているからです。READMEでも、安定したtool API、測定、assertion、検証を使う方向性が明記されています。([GitHub][1])

## Blender Pro MCPのベース

| 役割   | 採用候補                         | 使い方                                    |
| ---- | ---------------------------- | -------------------------------------- |
| 中核設計 | **PatrykIti/blender-ai-mcp** | メイン。安全・検証・ルーティングの土台                    |
| 基本接続 | ahujasid/blender-mcp         | Blender addon / MCP接続の参考               |
| 機能盛り | sandraschi/blender-mcp       | dashboard、headless、export、VSE、VRMなどの参考 |
| 完成品系 | 3D-Agent                     | OSSベースではなく、外部製品/参考枠                    |

`ahujasid/blender-mcp` はMITで、BlenderをClaudeなどのMCPクライアントから操作する元祖的な構成です。viewport screenshot、Sketchfab、Poly Haven、Hunyuan3D、Hyper3D Rodin、remote hostなどもREADMEに出ています。([GitHub][2])
`sandraschi/blender-mcp` はMITで、headless Blender、Live GUI bridge、48+ MCP tools、mesh edit、sculpt、GeoNodes、VSE、GLB/VRM/VRChat/Unity export、dashboardなどを持つ“全部入り”寄りの設計です。([GitHub][3])

3D-Agentは、月額プランや商用利用条件がある製品寄りです。Free Accountは0 automatic prompts、Starterは$10/月でCommercial licenseあり、Advancedは$100/月とされています。生成物の商用利用もpaid plansのみと説明されています。([3D-Agent][4]) さらに規約上、3D-Agent本体・UI・workflow・model・brandingなどを無断でcopy/modify/resell/sublicense/distribute/derivative product化することは禁止されています。([3D-Agent][5])
なので、**3D-Agentは統合MCPに組み込むOSSではなく、参考または外部利用枠**です。

---

## Blender Pro MCPに入れたいOSS全部まとめ

| 分野          | OSS / ツール                         | 役割                                         |
| ----------- | --------------------------------- | ------------------------------------------ |
| Blender制御   | PatrykIti/blender-ai-mcp          | 安定tool API、検証、goal routing                 |
| Blender接続   | ahujasid/blender-mcp              | addon/MCP接続、viewport screenshot、外部asset連携  |
| 高機能MCP      | sandraschi/blender-mcp            | headless、dashboard、VSE、VRM、GeoNodes、export |
| プロシージャル生成   | BlenderProc                       | 自動シーン生成、レンダー、合成データ、物理配置                    |
| glTF編集      | glTF-Transform                    | GLB/glTFの読み書き、最適化、圧縮、batch処理               |
| メッシュ軽量化     | meshoptimizer / gltfpack          | ポリゴン・index・vertex・animation圧縮              |
| UV展開        | xatlas                            | 自動UV、ライトマップUV、texture atlas                |
| PBR素材       | Material Maker                    | procedural PBR material、texture painting   |
| 地形/GIS      | BlenderGIS                        | DEM、OSM、GeoTIFF、地図/地形生成                    |
| パラメトリック     | Sverchok                          | node-based geometry、建築/形状生成                |
| シーン交換       | OpenUSD                           | 大規模3Dシーン交換、pipeline interchange            |
| 画像I/O       | OpenImageIO                       | VFX向け画像読み書き・変換・処理                          |
| HDR画像       | OpenEXR                           | レンダーパス、HDR、compositing向け                   |
| 色管理         | OpenColorIO / ACES                | film/VFX向けcolor management                 |
| 材質交換        | MaterialX                         | material/lookdev交換                         |
| ボリューム       | OpenVDB                           | fog、smoke、volume data                      |
| subdivision | OpenSubdiv                        | subdivision surface評価                      |
| shader      | OpenShadingLanguage               | advanced renderer向けshader記述                |
| 最終確認        | FFmpeg / image diff / render diff | turntable、preview、動画化、差分確認                 |

BlenderProcはGPL-3.0で、Blender内のPython環境で実行するprocedural rendering pipelineです。OBJ/PLY/BLEND/FBXなどの読み込み、物体配置、PBR material、light/camera sampling、RGB/depth/normal/segmentation出力などを持っています。([GitHub][6])
glTF-TransformはMITで、glTF 2.0を読み書き・編集・最適化できるJS/TS SDK/CLIです。CLIでは `gltf-transform optimize`、Draco、Meshopt、texture resize、WebP、KTX2/Basis圧縮などを扱えます。([GitHub][7])
meshoptimizerはMITで、メッシュを小さく・速くレンダリングできるようにする最適化ライブラリです。([GitHub][8]) xatlasはMITで、lightmapやtexture paintingに使えるUV座標生成ライブラリです。([GitHub][9])

Material MakerはMITで、Godotベースのprocedural texture authoring / 3D model paintingツールです。([GitHub][10]) BlenderGISはGPL-3.0で、Shapefile、raster、GeoTIFF DEM、OpenStreetMap XML、NASA SRTM標高データなどをBlenderに取り込めます。([GitHub][11]) SverchokもGPL-3.0で、architect/designer向けのparametric node geometry toolです。600以上のノード、parametric constructions、solid modeling、geometry analysis、CSV importなどを持ちます。([GitHub][12])

OpenColorIOは映画/VFX/アニメーション向けのcolor management、OpenImageIOはVFX/animation向け画像I/Oと処理、OpenEXRは映画業界向けのprofessional-grade HDR image format、MaterialXはmaterial/lookdev交換のopen standardです。([GitHub][13])
OpenUSDは大規模3Dシーン構築・交換用の高性能プラットフォーム、OpenVDBはDreamWorks発のsparse volumetric dataライブラリ、OpenSubdivはPixarのsubdivision surface評価ライブラリ、OpenShadingLanguageはmaterials/lights/displacement/pattern向けのshader languageです。([OpenUSD][14])

---

## Blender Pro MCPの理想構成

```text
Blender Pro MCP
├─ Core Router
│   ├─ goal-first routing
│   ├─ tool search
│   ├─ macro tools
│   └─ permission policy
│
├─ Blender Session Layer
│   ├─ live Blender bridge
│   ├─ headless Blender runner
│   ├─ bpy executor
│   └─ viewport screenshot/render capture
│
├─ Modeling Layer
│   ├─ mesh create/edit
│   ├─ geometry nodes
│   ├─ sculpt assist
│   ├─ xatlas UV
│   └─ meshoptimizer/gltfpack
│
├─ Material / Lookdev Layer
│   ├─ Material Maker adapter
│   ├─ MaterialX
│   ├─ OSL
│   ├─ OCIO/ACES
│   └─ OpenEXR/OpenImageIO
│
├─ Asset Pipeline Layer
│   ├─ glTF-Transform
│   ├─ OpenUSD
│   ├─ FBX/OBJ/GLB export
│   ├─ validation
│   └─ license/metadata manifest
│
├─ Procedural / World Layer
│   ├─ BlenderProc
│   ├─ BlenderGIS
│   ├─ Sverchok
│   └─ OpenVDB
│
└─ QC Layer
    ├─ polygon count check
    ├─ non-manifold check
    ├─ UV overlap check
    ├─ texture size check
    ├─ material completeness check
    ├─ render screenshot diff
    └─ export validation report
```

Blender側の“プロ品質”は、**作る能力**よりも **検証能力**で決まります。
AIが作ったモデルに対して、以下を必ずチェックさせるべきです。

```text
- scale / origin / naming
- polygon count
- non-manifold geometry
- flipped normals
- UV overlap
- missing textures
- texture resolution
- PBR map completeness
- material color space
- bounding box / real-world dimensions
- GLB/USD export success
- render preview
- target platform budget
```

---

# 2. Premiere用：Premiere Pro MCP構想

Premiere側は、**leancoderkavyをメイン実装の土台にするのが一番現実的**です。
理由は、Premiere操作系として必要な範囲を広く持ちながら、構成が比較的シンプルだからです。

| 役割               | 採用候補                               | 使い方                                          |
| ---------------- | ---------------------------------- | -------------------------------------------- |
| メイン編集MCP         | **leancoderkavy/premiere-pro-mcp** | 本命。269 tools、file-based IPC、CEP/ExtendScript |
| 最大火力参考           | ayushozha/AdobePremiereProMCP      | media engine、EDL、解析、巨大tool設計の参考              |
| 検証/安全参考          | hetpatel-11/Adobe_Premiere_Pro_MCP | live validation、agent skill、安全運用の参考          |
| Windows bridge参考 | antipaster/Adobe-Premiere-Pro-MCP  | Windows/WebSocket/CEP構成の参考                   |

`leancoderkavy/premiere-pro-mcp` は269 toolsを持ち、project info、sequence info、clip info、timeline summary、search、state snapshotなどのinspection系から編集・エフェクト・書き出しまで扱う構成です。file-based IPCでCEP pluginに命令を渡し、Premiere側で `CSInterface.evalScript()` を実行する構成になっています。([GitHub][15])
同リポジトリは、CEP/ExtendScript/QE DOMを使う理由として、UXPよりPremiere ProでのAPI coverageが広く、QE DOMでeffect by name、ripple delete、advanced trimなどを補えると説明しています。さらにscript validation、`eval()` / `new Function()` / `System.callSystem()` block、script size limitなどの安全策も説明しています。([GitHub][15])

`ayushozha/AdobePremiereProMCP` はMITで、Premiereのtimeline、color grading、audio mixing、effects、graphics、exportなどを自然言語で操作する巨大MCPです。READMEでは1,060 MCP Toolsとしつつ、別箇所ではTotal 907 toolsやAboutで1,027 toolsとも表示されているので、**最大火力だが検証前提**で見るべきです。([GitHub][16])
`hetpatel-11/Adobe_Premiere_Pro_MCP` は、2026年3月4日時点で97 tools exposed、43 tools live-executed、50 tools schema-validatedと明記しており、実測検証を重視しています。([GitHub][17])
`antipaster/Adobe-Premiere-Pro-MCP` はMITで、Windows向けに170+ tools、Node.js MCP Server → WebSocket → CEP Panel → ExtendScript → Premiere Proの構成です。([GitHub][18])

---

## Premiere Pro MCPに入れたいOSS全部まとめ

| 分野              | OSS / ツール                          | 役割                                                |
| --------------- | ---------------------------------- | ------------------------------------------------- |
| Premiere制御      | leancoderkavy/premiere-pro-mcp     | メイン編集操作                                           |
| 巨大設計参考          | ayushozha/AdobePremiereProMCP      | media engine、script parsing、EDL、shot matching     |
| 検証参考            | hetpatel-11/Adobe_Premiere_Pro_MCP | live validation、agent skill                       |
| Windows bridge  | antipaster/Adobe-Premiere-Pro-MCP  | Windows + WebSocket + CEP                         |
| Premiere API参考  | Adobe CEP Samples / PProPanel      | ExtendScript API学習、CEP実装参考                        |
| Python Premiere | Pymiere                            | PythonからPremiere操作、ExtendScript mirror            |
| タイムライン交換        | OpenTimelineIO                     | EDL/FCPXML/AAF的なtimeline interchange              |
| エンコード/解析        | FFmpeg / ffprobe                   | 変換、プロキシ、音声、フレーム、書き出し検証                            |
| メディア情報          | MediaInfo                          | codec、fps、bitrate、audio channel、metadata確認        |
| Python動画処理      | PyAV                               | FFmpeg librariesのPython binding                   |
| ショット検出          | PySceneDetect                      | cut/scene detection、shot分割                        |
| 無音カット           | Auto-Editor                        | silence cut、自動粗編集、Premiere XML export             |
| 文字起こし           | WhisperX                           | word-level timestamp、speaker diarization          |
| 軽量文字起こし         | whisper.cpp / faster-whisper       | ローカル/高速ASR                                        |
| 字幕編集            | Subtitle Edit                      | subtitle correction、sync、format conversion        |
| Python編集        | MoviePy                            | 小素材生成、SNS短尺、preview generation                    |
| 音声解析            | librosa                            | beat、tempo、音響特徴量                                  |
| ラウドネス           | pyloudnorm                         | LUFS/BS.1770 loudness check                       |
| 音源分離            | Demucs                             | vocal/music/stem separation                       |
| 画質評価            | VMAF                               | export quality score、reference comparison         |
| 最終QC            | custom ffmpeg scripts              | black frame、silence、clipping、duration、fps、codec検査 |

OpenTimelineIOはeditorial cut情報のAPI/交換フォーマットで、cutsの順序・長さ・外部メディア参照を扱うもので、メディア自体を入れるcontainerではありません。([GitHub][19])
FFmpegは録画・変換・streaming用のcross-platform multimedia frameworkです。([FFmpeg][20]) PySceneDetectはshot change検出と動画分割に使えるOSSで、2026年5月3日時点でv0.7が出ています。([SceneDetect][21]) WhisperXはword-level timestampsとspeaker diarizationに対応した高速ASRです。([GitHub][22])

Auto-Editorは自動編集CLIで、Premiere ProにimportできるXMLを出せます。([GitHub][23]) MoviePyはPythonの動画編集ライブラリで、cuts、concatenations、titles、compositing、video processingなどを扱えます。([PyPI][24]) PymiereはPremiere Pro ExtendScript objectsのPython mirrorを含み、Python側からPremiere操作を組む参考になります。([GitHub][25]) AdobeのPProPanel sampleはPremiere Pro ExtendScript APIを広く試す公式サンプルです。([GitHub][26])

MediaInfoは動画/音声ファイルのtechnical/tag metadataを表示するツールです。([GitHub][27]) pyloudnormはITU-R BS.1770-4のloudness meter実装です。([PyPI][28]) Demucsはvocal/drums/bassなどのmusic source separationモデルです。([GitHub][29]) VMAFはNetflix開発のperceptual video quality assessment algorithmで、libvmafとPython wrapperを含みます。([GitHub][30])

---

## Premiere Pro MCPの理想構成

```text
Premiere Pro MCP
├─ Core Router
│   ├─ tool search
│   ├─ macro workflows
│   ├─ job queue
│   ├─ approval policy
│   └─ project snapshot
│
├─ Premiere Bridge Layer
│   ├─ CEP / ExtendScript
│   ├─ QE DOM adapter
│   ├─ UXP future adapter
│   ├─ WebSocket bridge optional
│   └─ file-based IPC optional
│
├─ Media Index Layer
│   ├─ FFmpeg / ffprobe
│   ├─ MediaInfo
│   ├─ PyAV
│   ├─ thumbnail generation
│   ├─ waveform cache
│   └─ proxy generation
│
├─ Intelligence Layer
│   ├─ WhisperX / whisper.cpp
│   ├─ PySceneDetect
│   ├─ Auto-Editor
│   ├─ librosa
│   ├─ Demucs
│   └─ shot / transcript / beat index
│
├─ Timeline Layer
│   ├─ OpenTimelineIO
│   ├─ EDL / FCPXML / XML
│   ├─ sequence builder
│   ├─ rough cut generator
│   └─ revision diff
│
├─ Finishing Layer
│   ├─ captions
│   ├─ graphics / MOGRT
│   ├─ color preset / Lumetri
│   ├─ audio levels
│   └─ export presets
│
└─ QC Layer
    ├─ black frame detection
    ├─ silence/clipping detection
    ├─ LUFS check
    ├─ captions overlap check
    ├─ offline media check
    ├─ codec/fps/resolution check
    ├─ VMAF optional
    └─ delivery report
```

PremiereはBlenderよりAPI面が難しいです。AdobeのPremiere Pro scripting guideでは、2025年11月時点で3rd-party scriptingはUXPへ移行し、ExtendScript-based integrationsは2026年9月までサポート予定とされています。([PPro Scripting][31]) またPremiere Pro 23.0以降、ExtendScript APIへの追加や改善は予定されていないとも書かれています。([PPro Scripting][32])
だから、**今はCEP/ExtendScript/QE DOMで実用化しつつ、長期的にはUXP adapterを別レイヤーで用意する**のが正解です。

---

# 3. 「全部を1つのMCP」にする時の正しい設計

ここが一番大事です。

## ダメな設計

```text
AIに2,000個のtoolを全部見せる
Premiere MCPを4つ同時に起動
Blender MCPを3つ同時に起動
GPL/MIT/Apache/商用コードを全部1 repoに混ぜる
raw script executionを常時許可
delete/export/publishを承認なし
```

これは事故ります。
AIがどのtoolを使うべきか迷うし、同じPremiere timelineやBlender sceneを複数bridgeが同時に書き換えて、Undo履歴・状態・ログが壊れやすいです。

## 良い設計

```text
1つの統合MCP
  ↓
内部ルーター
  ↓
必要なadapterだけ呼ぶ
  ↓
AIにはmacro toolだけ見せる
  ↓
危険操作はapproval
  ↓
実行後はQC report
```

MCPセキュリティの公式best practicesでも、MCP実装ではリスク、attack vectors、権限、運用上の安全策を考える必要があるとされています。([Model Context Protocol][33]) OpenAIのMCPドキュメントでも、機密操作や書き込み操作には `require_approval` や `allowed_tools` を使って承認・制限することが推奨されています。([OpenAI Developers][34])

---

# 4. 実際にAIへ見せるtoolは少なくする

統合MCPの内部には1000個以上の機能があってもいいです。
でもAIに見せるのは、こういう**大きなmacro tool**だけでいいです。

## Blender側macro tools

```text
blender.plan_asset
blender.build_scene
blender.create_model_from_brief
blender.create_material_pack
blender.optimize_asset
blender.export_game_ready
blender.render_preview
blender.validate_asset
blender.fix_asset_issues
blender.generate_turntable
```

裏側では、これらが `bpy`、glTF-Transform、meshoptimizer、xatlas、Material Maker、OpenImageIO、OpenColorIO、BlenderProcなどを使います。

## Premiere側macro tools

```text
premiere.ingest_media
premiere.index_project
premiere.make_rough_cut_from_script
premiere.cut_interview
premiere.add_broll
premiere.auto_caption
premiere.mix_audio
premiere.apply_brand_package
premiere.export_social_variants
premiere.run_delivery_qc
premiere.fix_qc_issues
```

裏側では、Premiere bridge、FFmpeg、MediaInfo、OpenTimelineIO、WhisperX、PySceneDetect、Auto-Editor、pyloudnorm、VMAFなどを使います。

つまり、AIにこう頼めるようになります。

```text
Blender:
  「Roblox/Unity向けの低容量SFドアを作って、PBR素材を付けて、GLBで出して、ポリゴン数とUVとテクスチャ容量を検証して」

Premiere:
  「このインタビュー素材から60秒のYouTube Shortsを作って、字幕を入れて、無音を詰めて、音量を-14 LUFS付近に整えて、1080x1920で書き出してQCして」
```

---

# 5. Blender用とPremiere用は分けるべき

**最終的には2つのMCPに分けるべき**です。

```text
blender-pro-mcp
premiere-pro-mcp
```

理由は、依存関係・実行環境・失敗パターンが全然違うからです。

| 項目         | Blender                  | Premiere                          |
| ---------- | ------------------------ | --------------------------------- |
| 主API       | bpy / addon / Python     | CEP / ExtendScript / QE DOM / UXP |
| headless実行 | かなり向いている                 | 限定的                               |
| 検証         | geometry/render/export中心 | timeline/audio/caption/export中心   |
| 重い処理       | render、mesh、texture      | transcription、scene detect、encode |
| 事故         | scene破壊、ファイル削除、重いrender  | timeline破壊、書き出しミス、音量ミス            |
| ベース        | PatrykIti型               | leancoderkavy型                    |

ただし、共通coreは1つでいいです。

```text
creative-mcp-core
├─ tool registry
├─ plugin loader
├─ job queue
├─ artifact store
├─ policy engine
├─ approval system
├─ license manifest
├─ logging
├─ cache
└─ QC report schema
```

その上に、

```text
blender-pro-mcp
premiere-pro-mcp
```

を載せるのがきれいです。

---

# 6. ライセンス的な注意

この統合案で一番大事なのは、**コードを直接混ぜないこと**です。

MIT / Apache系は比較的扱いやすいです。

```text
MIT:
  ahujasid/blender-mcp
  sandraschi/blender-mcp
  glTF-Transform
  meshoptimizer
  xatlas
  Material Maker
  leancoderkavy/premiere-pro-mcp
  ayushozha/AdobePremiereProMCP
  antipaster/Adobe-Premiere-Pro-MCP

Apache-2.0:
  PatrykIti/blender-ai-mcp
```

一方で、GPL系は注意です。

```text
GPL-3.0:
  BlenderProc
  BlenderGIS
  Sverchok
```

GPL系は、閉源商用MCPにコードを直接組み込むなら慎重に扱う必要があります。実用的には、**GPLツールは“外部CLI/外部addon/別プロセスadapter”として呼び出し、コードを統合repoに混ぜない**ほうが安全です。もちろん、配布形態によって判断が変わるので、本気で商用配布するならライセンス監査が必要です。

3D-AgentはOSSとして統合する対象ではなく、規約上も本体やworkflow、model、brandingなどの無断改変・再配布・派生製品化は避けるべきです。([3D-Agent][5])

---

# 7. “プロレベル”にするための品質ゲート

統合MCPで重要なのは、**生成よりQC**です。

## Blender QC

```text
- render preview作成
- object naming check
- scale/origin check
- polygon budget check
- non-manifold check
- flipped normals check
- UV overlap check
- material slot check
- missing texture check
- texture resolution check
- color space check
- GLB/USD export test
- target app import test
```

## Premiere QC

```text
- offline media check
- sequence fps/resolution check
- black frame detection
- silent gap detection
- audio clipping detection
- LUFS loudness check
- caption overlap check
- spelling/word timing check
- export preset check
- codec/bitrate check
- duration check
- thumbnail generation
- VMAF/visual diff optional
```

これを毎回レポート化します。

```json
{
  "status": "fail",
  "blocking_issues": [
    "audio_loudness_too_low",
    "caption_overlap_at_00:31.2",
    "offline_media_detected"
  ],
  "suggested_fixes": [
    "normalize_audio_to_-14_lufs",
    "shift_caption_end_time",
    "relink_missing_clip"
  ]
}
```

AIはこのQC reportを見て、もう一回修正します。
このループができると、かなりプロっぽくなります。

---

# 8. 実装ロードマップ

いきなり全部入れるより、こう進めるのがいいです。

## Phase 1：最小で強いMVP

```text
Blender:
  PatrykIti/blender-ai-mcp
  + glTF-Transform
  + meshoptimizer
  + xatlas
  + OpenImageIO/OpenColorIO
  + render/QC

Premiere:
  leancoderkavy/premiere-pro-mcp
  + FFmpeg
  + MediaInfo
  + OpenTimelineIO
  + WhisperX
  + PySceneDetect
  + Auto-Editor
  + pyloudnorm
```

## Phase 2：macro tool化

```text
Blender:
  create_game_asset
  optimize_glb
  validate_asset
  render_turntable

Premiere:
  rough_cut_from_script
  auto_caption
  mix_audio
  export_and_qc
```

## Phase 3：高機能化

```text
Blender:
  BlenderProc
  Material Maker
  BlenderGIS
  Sverchok
  OpenUSD
  MaterialX
  OpenVDB

Premiere:
  Demucs
  VMAF
  MoviePy
  PyAV
  Pymiere
  Subtitle Edit
  custom brand package system
```

## Phase 4：Dashboard

```text
- job history
- asset preview
- timeline preview
- QC report
- tool execution log
- approval queue
- license manifest
- export manifest
```

## Phase 5：Director Agent

```text
Director Agent:
  「広告動画を作る」

↓ 自動分解

Blender Pro MCP:
  商品3D素材・背景・タイトル素材を作る

Premiere Pro MCP:
  素材を編集・字幕・音声・書き出し

Review Agent:
  QC reportと差分を確認
```

---

# 9. 最終的なおすすめ構成

## Blender Pro MCP

```text
Core:
  PatrykIti/blender-ai-mcp

参考/移植:
  ahujasid/blender-mcp
  sandraschi/blender-mcp

外部/参考:
  3D-Agent

Adapters:
  BlenderProc
  glTF-Transform
  meshoptimizer/gltfpack
  xatlas
  Material Maker
  BlenderGIS
  Sverchok
  OpenUSD
  OpenImageIO
  OpenEXR
  OpenColorIO
  MaterialX
  OpenVDB
  OpenSubdiv
  OpenShadingLanguage

Macro:
  create_asset
  create_scene
  optimize_asset
  validate_asset
  render_preview
  export_game_ready
```

## Premiere Pro MCP

```text
Core:
  leancoderkavy/premiere-pro-mcp

参考/移植:
  ayushozha/AdobePremiereProMCP
  hetpatel-11/Adobe_Premiere_Pro_MCP
  antipaster/Adobe-Premiere-Pro-MCP

Adapters:
  FFmpeg
  MediaInfo
  PyAV
  OpenTimelineIO
  PySceneDetect
  WhisperX
  whisper.cpp / faster-whisper
  Auto-Editor
  MoviePy
  Pymiere
  Adobe PProPanel
  librosa
  pyloudnorm
  Demucs
  VMAF
  Subtitle Edit

Macro:
  ingest_media
  index_media
  rough_cut_from_script
  cut_interview
  add_broll
  auto_caption
  mix_audio
  export_social_variants
  run_delivery_qc
```

---

# 最終結論

**めっちゃプロレベルのものは作れます。**
ただし、鍵は「OSSを全部入れること」ではなく、**全部を“統合された制作パイプライン”として管理すること**です。

一番いい形はこれです。

```text
Blender Pro MCP:
  PatrykIti型の安全・検証ルーティング
  + ahujasid/sandraschiの接続・機能設計
  + glTF/mesh/material/render/QC系OSS

Premiere Pro MCP:
  leancoderkavy型の安定Premiere操作
  + ayushozhaの巨大設計
  + hetpatelの検証思想
  + FFmpeg/OTIO/WhisperX/PySceneDetect/QC系OSS

共通:
  tool router
  macro tools
  allowed_tools
  require_approval
  job queue
  artifact store
  QC report
  license manifest
```

つまり、**“全部入り万能MCP”ではなく、“プロ制作会社の内製パイプラインをMCP化する”**イメージです。
それなら、BlenderもPremiereもかなり本気のAI制作環境になります。

[1]: https://github.com/PatrykIti/blender-ai-mcp "GitHub - PatrykIti/blender-ai-mcp: Production-shaped MCP server for Blender with goal-first routing, curated tools, deterministic verification, and vision-assisted 3D modeling workflows. · GitHub"
[2]: https://github.com/ahujasid/blender-mcp "GitHub - ahujasid/blender-mcp · GitHub"
[3]: https://github.com/sandraschi/blender-mcp "GitHub - sandraschi/blender-mcp: Blender 3D automation via FastMCP 3.2 — 41 portmanteau tools, 150+ operations. AI construction, VRM avatars, Gaussian splats, VSE video editing, Grease Pencil 2D animation, Tauri 2.0 desktop. React dashboard. · GitHub"
[4]: https://3d-agent.com/pricing "3D-Agent Pricing — Plans & Features | Free Account"
[5]: https://3d-agent.com/terms-and-conditions "Terms and Conditions | 3D-Agent"
[6]: https://github.com/DLR-RM/BlenderProc "GitHub - DLR-RM/BlenderProc: A procedural Blender pipeline for photorealistic training image generation · GitHub"
[7]: https://github.com/donmccurdy/glTF-Transform "GitHub - donmccurdy/glTF-Transform: glTF 2.0 SDK for JavaScript and TypeScript, on Web and Node.js. · GitHub"
[8]: https://github.com/zeux/meshoptimizer "GitHub - zeux/meshoptimizer: Mesh optimization library that makes meshes smaller and faster to render · GitHub"
[9]: https://github.com/jpcy/xatlas "GitHub - jpcy/xatlas: Mesh parameterization / UV unwrapping library · GitHub"
[10]: https://github.com/RodZill4/material-maker "GitHub - RodZill4/material-maker: A procedural textures authoring and 3D model painting tool based on the Godot game engine · GitHub"
[11]: https://github.com/domlysz/blendergis "GitHub - domlysz/BlenderGIS: Blender addons to make the bridge between Blender and geographic data · GitHub"
[12]: https://github.com/nortikin/sverchok "GitHub - nortikin/sverchok: Sverchok · GitHub"
[13]: https://github.com/AcademySoftwareFoundation/OpenColorIO?utm_source=chatgpt.com "AcademySoftwareFoundation/OpenColorIO: A color ..."
[14]: https://openusd.org/?utm_source=chatgpt.com "OpenUSD"
[15]: https://github.com/leancoderkavy/premiere-pro-mcp "GitHub - leancoderkavy/premiere-pro-mcp: MCP server for controlling Adobe Premiere Pro via CEP/ExtendScript — 269 tools for AI-driven video editing · GitHub"
[16]: https://github.com/ayushozha/AdobePremiereProMCP "GitHub - ayushozha/AdobePremiereProMCP:  AI-powered MCP server for Adobe Premiere Pro — 1,027 tools for timeline editing, color grading, audio mixing, effects, export & more. Control video editing with natural language via Claude, GPT, or any AI assistant. The most comprehensive MCP server for any NLE. · GitHub"
[17]: https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP "GitHub - hetpatel-11/Adobe_Premiere_Pro_MCP: Adobe Premiere Pro MCP · GitHub"
[18]: https://github.com/antipaster/Adobe-Premiere-Pro-MCP "GitHub - antipaster/Adobe-Premiere-Pro-MCP: Control Adobe Premiere Pro from Claude/Codex with 170+ editing tools via Model Context Protocol · GitHub"
[19]: https://github.com/AcademySoftwareFoundation/OpenTimelineIO?utm_source=chatgpt.com "AcademySoftwareFoundation/OpenTimelineIO"
[20]: https://ffmpeg.org/?utm_source=chatgpt.com "FFmpeg"
[21]: https://www.scenedetect.com/?utm_source=chatgpt.com "PySceneDetect: Home"
[22]: https://github.com/m-bain/whisperx?utm_source=chatgpt.com "WhisperX: Automatic Speech Recognition with Word- ..."
[23]: https://github.com/wyattblue/auto-editor?utm_source=chatgpt.com "WyattBlue/auto-editor: Effort free video editing!"
[24]: https://pypi.org/project/moviepy/?utm_source=chatgpt.com "moviepy"
[25]: https://github.com/qmasingarbe/pymiere?utm_source=chatgpt.com "qmasingarbe/pymiere: Python for Premiere pro"
[26]: https://github.com/Adobe-CEP/Samples/blob/master/PProPanel/ReadMe.md?utm_source=chatgpt.com "Samples/PProPanel/ReadMe.md at master · Adobe-CEP/ ..."
[27]: https://github.com/mediaarea/mediainfo?utm_source=chatgpt.com "MediaArea/MediaInfo: Convenient unified display of ..."
[28]: https://pypi.org/project/pyloudnorm/?utm_source=chatgpt.com "pyloudnorm"
[29]: https://github.com/facebookresearch/demucs?utm_source=chatgpt.com "facebookresearch/demucs: Code for the paper Hybrid ..."
[30]: https://github.com/Netflix/vmaf?utm_source=chatgpt.com "VMAF - Video Multi-Method Assessment Fusion"
[31]: https://ppro-scripting.docsforadobe.dev/?utm_source=chatgpt.com "Premiere Pro Scripting Guide"
[32]: https://ppro-scripting.docsforadobe.dev/introduction/changelog/?utm_source=chatgpt.com "Changelog - Premiere Pro Scripting Guide"
[33]: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices?utm_source=chatgpt.com "Security Best Practices"
[34]: https://developers.openai.com/api/docs/guides/tools-connectors-mcp?utm_source=chatgpt.com "MCP and Connectors | OpenAI API"

うん、**公開してもいい前提なら、GPL系を入れてもかなり現実的**です。
ただし、入れ方を間違えると「MCP全体をGPL扱いにする必要が出る」ので、設計を分けたほうがいいです。

あと、**3D-Agentは外しましょう。** OSS統合MCPの部品としては不要です。

## 1. GPL系はMCPにまとめてもいい？

**公開OKなら、基本的にはできます。**
特にあなたが「この統合MCPはOSSとして公開してもいい」と考えているなら、GPL系を入れるハードルはかなり下がります。

ただし、重要なのはここです。

```text
GPLツールを“中に組み込む”なら、
その結合物・改変物はGPLで公開する覚悟が必要。

GPLツールを“外部プログラムとして呼ぶ”なら、
MCP本体をMIT/Apacheに保てる余地がある。
```

GNU GPL FAQでは、複数プログラムを一緒に配布する「aggregate」は可能で、別プログラム同士が pipes / sockets / command-line arguments で通信する場合は通常は別プログラムと見られる、と説明されています。ただし、通信内容が内部データ構造を密にやり取りするほど一体のプログラムと見られる可能性もある、とされています。([GNU][1])

つまり、こういう分け方が安全です。

## おすすめは「GPLコード直混ぜ」ではなく「GPLアダプタ方式」

### 一番安全な構成

```text
creative-mcp-core
  MIT / Apache-2.0

blender-pro-mcp
  MIT / Apache-2.0

adapters/gpl/
  blenderproc_adapter
  blendergis_adapter
  sverchok_adapter

外部実行:
  blenderproc CLI
  Blender + BlenderGIS addon
  Blender + Sverchok addon
```

MCP本体は、GPLツールを直接importして一体化するのではなく、**別プロセス・CLI・Blender内addon・一時ファイル・JSON入出力**で呼び出す形がいいです。

```text
MCP tool call
  ↓
adapterがJSON jobを作る
  ↓
GPLツールを外部プロセス/Blender addonとして実行
  ↓
結果だけJSON/ファイルで受け取る
```

この形なら、MCP本体は「司令塔」で、GPLツールは「外部ワーカー」にできます。

## GPL系を完全に混ぜるなら？

それもできます。
ただし、その場合は**統合MCP全体をGPL-3.0-or-laterで公開**するのが一番スッキリします。

GPLv3は、配布する場合に受け手にも同じ自由を渡し、ソースコードを受け取れるようにすることを求めています。GPL本文でも、コピーを配布する場合は受領者がソースコードを受け取れるようにし、ライセンス条件を示す必要があると説明されています。([GNU][2])

なので、公開前提ならこの形もアリです。

```text
blender-pro-mcp-gpl
  GPL-3.0-or-later

中に入れてOK:
  BlenderProc
  BlenderGIS
  Sverchok
  GPL系アダプタ
  自作改変コード
```

ただし、MIT/ApacheのコードをGPLプロジェクトに取り込むことは多くの場合できますが、**逆にGPLコードをMIT/Apacheの閉じた本体へ混ぜるのは危ない**です。

## 2. GPL系OSSごとの扱い

前に挙げた中でGPL注意なのは主にこれです。

| OSS          | ライセンス           | 入れ方のおすすめ                             |
| ------------ | --------------- | ------------------------------------ |
| BlenderProc  | GPL-3.0         | 外部CLI/別プロセスadapter、またはGPL版MCPに含める    |
| BlenderGIS   | GPL-3.0         | Blender addonとして外部利用。MCP本体には直混ぜしない   |
| Sverchok     | GPL3            | Blender addonとして外部利用。ノード生成adapterを作る |
| Blender本体連携系 | Blender側GPL文脈あり | MCPは外部制御、addon配布時はGPL注意              |

BlenderProcはGPL-3.0で、OBJ/PLY/BLEND/FBXなどの読み込み、物理配置、PBR素材、ライト/カメラ、RGB/depth/normal/segmentation出力などを扱うprocedural rendering pipelineです。([GitHub][3])
BlenderGISもGPL-3.0で、Shapefile、raster、GeoTIFF DEM、OpenStreetMap XMLなどのGISデータをBlenderに取り込めます。([GitHub][4])
SverchokもGPL3で、Blender向けのパラメトリック/ノードベース形状生成addonです。([GitHub][5])

だから、Blender用統合MCPはこうするのがいいです。

```text
blender-pro-mcp-core
  permissive license

blender-pro-mcp-gpl-adapters
  GPL-3.0-or-later

ユーザー側:
  必要ならGPL adaptersを有効化
```

これなら、GPLを嫌う人はcoreだけ使えるし、全部入りで使いたい人はGPL adaptersを入れられます。

## 3. 公開するなら、どうライセンス表記すべき？

おすすめはこの3層です。

```text
/ core
  Apache-2.0 or MIT

/ adapters / permissive
  MIT / Apache-2.0

/ adapters / gpl
  GPL-3.0-or-later

/ third_party
  各OSSのLICENSEとNOTICE
```

READMEにはこう書くとわかりやすいです。

```text
This project is modular.

Core MCP server is licensed under Apache-2.0.
GPL adapters are licensed under GPL-3.0-or-later and are optional.
When GPL adapters are distributed or enabled as part of a combined work,
GPL obligations may apply to the combined distribution.
```

日本語なら：

```text
本プロジェクトはモジュール式です。
MCP coreはApache-2.0で提供します。
GPL adaptersは任意機能であり、GPL-3.0-or-laterで提供します。
GPL adaptersを同梱・改変・一体配布する場合、結合物にGPL上の義務が及ぶ可能性があります。
```

本気で安全にするなら、**coreとGPL adaptersを別リポジトリ**に分けるのが一番きれいです。

```text
creative-mcp-core
blender-pro-mcp
blender-pro-mcp-gpl-adapters
premiere-pro-mcp
```

## 4. 「公開してるからOK」ではなく、これを守る

公開前提でも、最低限これが必要です。

```text
- GPL対象コードのソースを公開する
- 改変箇所を明記する
- 元の著作権表示を残す
- GPL LICENSEを同梱する
- 依存OSSのLICENSE/NOTICEをまとめる
- バイナリ配布するなら対応するソースへの案内を置く
- 追加の制限、NDA、再配布禁止などを付けない
```

GPLv3本文では、ソースコードは改変に適した形式であり、object code配布時には対応するソースコードを入手できるようにする必要があります。さらに、GPLで与えられた権利に追加制限を課せないとも規定されています。([GNU][2])

なので、**公開OKならGPL系を使える。けど、公開するだけでなくGPLとしてちゃんと配布する**のが大事です。

---

# 5. antipaster/Adobe-Premiere-Pro-MCPはMacでも使える？

**そのままではMac対応と見ないほうがいいです。**
`antipaster/Adobe-Premiere-Pro-MCP` のREADMEは要件に **Windows** と明記していて、インストールも `install.bat` 前提です。構成は `Node.js MCP Server → WebSocket → CEP Panel → ExtendScript → Premiere Pro` です。([GitHub][6])

なので結論はこうです。

```text
antipasterをそのままMacで使う:
  非推奨。動作保証なし

antipasterのtool設計やExtendScriptを参考にする:
  アリ

Mac対応させるために移植する:
  可能性はある

Mac本命にする:
  leancoderkavyのほうが向いている
```

なぜかというと、Premiere Proの操作自体はCEP/ExtendScriptなのでMacでも通る部分が多いはずですが、**インストーラ、CEP拡張フォルダ、デバッグ設定、パス処理、WebSocket/ポート、ファイルパス区切り、権限まわり**がWindows前提になっている可能性があります。

一方で `leancoderkavy/premiere-pro-mcp` は、READMEにmacOSとWindows両方の手動CEPインストール手順があり、file-based IPC bridgeはmacOS/Windowsで動くと説明されています。([GitHub][7])
だからMac対応まで考えるなら、**Premiere統合MCPの中核はleancoderkavy型にして、antipasterはWindows bridge/tool設計の参考にする**ほうがいいです。

## antipasterを入れるなら役割はこれ

```text
Premiere Pro MCP core:
  leancoderkavy型

Mac対応:
  leancoderkavyのfile-based IPC / CEP install方式

Windows対応:
  antipasterのWebSocket bridge設計を参考

最大機能参考:
  ayushozha

検証/安全参考:
  hetpatel
```

つまり、antipasterを「Macでも同様に使えるPremiere MCP」として採用するより、**Windows adapterの参考実装**として扱うのが安全です。

---

# 6. 3D-Agentなしの最終構成

了解です。3D-Agentは外します。

## Blender Pro MCP

```text
Core:
  PatrykIti/blender-ai-mcp型
  - safety
  - verification
  - goal-first routing
  - macro tools

参考:
  ahujasid/blender-mcp
  - Blender接続
  - viewport screenshot
  - asset連携

参考:
  sandraschi/blender-mcp
  - dashboard
  - headless
  - export
  - VSE
  - GeoNodes系設計

Permissive adapters:
  glTF-Transform
  meshoptimizer / gltfpack
  xatlas
  Material Maker
  OpenUSD
  OpenImageIO
  OpenEXR
  OpenColorIO
  MaterialX
  OpenVDB
  OpenSubdiv
  OpenShadingLanguage

GPL adapters:
  BlenderProc
  BlenderGIS
  Sverchok
```

この構成では、GPL系は `/adapters/gpl` に分けます。

## Premiere Pro MCP

```text
Core:
  leancoderkavy/premiere-pro-mcp型
  - cross-platform CEP
  - file-based IPC
  - ExtendScript/QE DOM
  - 269 tools系の広いPremiere操作

参考:
  ayushozha/AdobePremiereProMCP
  - media scan
  - script parse
  - EDL
  - shot matching
  - 最大火力設計

参考:
  hetpatel-11/Adobe_Premiere_Pro_MCP
  - live validation
  - schema validation
  - agent skill設計

Windows adapter参考:
  antipaster/Adobe-Premiere-Pro-MCP
  - WebSocket bridge
  - Windows CEP設計

外部OSS:
  FFmpeg
  MediaInfo
  PyAV
  OpenTimelineIO
  PySceneDetect
  WhisperX
  whisper.cpp / faster-whisper
  Auto-Editor
  MoviePy
  Pymiere
  Adobe PProPanel
  librosa
  pyloudnorm
  Demucs
  VMAF
  Subtitle Edit
```

Premiere側はGPL系よりも、**Adobe API/CEP/QE DOM/UXP移行**のほうが注意点です。`leancoderkavy` はCEP/ExtendScript/QE DOMを使い、任意スクリプト実行など強い操作もあるので、信頼済みクライアントだけ接続する必要があります。同リポジトリのSecurity欄でも、AIにPremiere Proへの大きな操作権限を渡すため、trusted MCP clientだけ使うよう注意しています。([GitHub][8])

---

# 7. 僕ならこう設計する

## リポジトリ構成

```text
creative-pipeline-mcp/
  packages/
    core/
      license: Apache-2.0

    blender-pro-mcp/
      license: Apache-2.0

    blender-permissive-adapters/
      license: MIT/Apache-compatible

    blender-gpl-adapters/
      license: GPL-3.0-or-later

    premiere-pro-mcp/
      license: MIT/Apache-2.0

    premiere-windows-adapter/
      license: MIT
      notes: antipaster-inspired

    qc-tools/
      license: Apache-2.0

  third_party_licenses/
    BlenderProc_LICENSE
    BlenderGIS_LICENSE
    Sverchok_LICENSE
    FFmpeg_LICENSE
    OpenTimelineIO_LICENSE
    ...
```

## AIに見せるtoolは少なくする

中身に大量OSSを入れても、AIに全部は見せません。

```text
Blender:
  blender.create_asset
  blender.optimize_asset
  blender.validate_asset
  blender.render_preview
  blender.export_game_ready
  blender.generate_world_from_gis
  blender.generate_procedural_scene

Premiere:
  premiere.ingest_media
  premiere.index_media
  premiere.rough_cut_from_script
  premiere.cut_interview
  premiere.auto_caption
  premiere.mix_audio
  premiere.export_variants
  premiere.run_qc
```

裏側で必要に応じて、GPL adapterやFFmpeg/WhisperX/glTF-Transformを呼びます。

---

# 最終結論

**GPL系は、公開OKなら入れていいです。**
ただし、**coreに直混ぜするより、GPL adaptersとして分離**するのが一番きれいです。

おすすめは：

```text
CoreはApache/MIT
GPL系はoptional GPL adapters
公開版ではLICENSE/NOTICE/sourceを完備
必要ならGPL全部入り版も別配布
```

`antipaster/Adobe-Premiere-Pro-MCP` は、**そのままMacで同様に使えるとは見ないほうがいい**です。README上の要件はWindowsで、インストールも `install.bat` です。Mac対応を重視するなら、**leancoderkavyを中核にして、antipasterはWindows/WebSocket adapterの参考**にするのがベストです。

[1]: https://www.gnu.org/licenses/gpl-faq.html "Frequently Asked Questions about the GNU Licenses
\- GNU Project - Free Software Foundation"
[2]: https://www.gnu.org/licenses/gpl-3.0.en.html "The GNU General Public License v3.0
\- GNU Project - Free Software Foundation"
[3]: https://github.com/DLR-RM/BlenderProc "GitHub - DLR-RM/BlenderProc: A procedural Blender pipeline for photorealistic training image generation · GitHub"
[4]: https://github.com/domlysz/blendergis "GitHub - domlysz/BlenderGIS: Blender addons to make the bridge between Blender and geographic data · GitHub"
[5]: https://github.com/nortikin/sverchok?utm_source=chatgpt.com "nortikin/sverchok"
[6]: https://github.com/antipaster/Adobe-Premiere-Pro-MCP "GitHub - antipaster/Adobe-Premiere-Pro-MCP: Control Adobe Premiere Pro from Claude/Codex with 170+ editing tools via Model Context Protocol · GitHub"
[7]: https://github.com/leancoderkavy/premiere-pro-mcp "GitHub - leancoderkavy/premiere-pro-mcp: MCP server for controlling Adobe Premiere Pro via CEP/ExtendScript — 269 tools for AI-driven video editing · GitHub"
[8]: https://github.com/leancoderkavy/premiere-pro-mcp/security?utm_source=chatgpt.com "Security - leancoderkavy/premiere-pro-mcp"

次やることは、**いきなり全部統合ではなく、公開前提の「2本の統合MCP MVP」を作ること**です。

最初のゴールはこれです。

```text
blender-pro-mcp
  → Blender制作・最適化・検証用

premiere-pro-mcp
  → Premiere編集・素材解析・字幕・音声・書き出しQC用
```

共通部分は別にします。

```text
creative-mcp-core
  → tool router / job queue / approval / logging / QC report / license manifest
```

## まず決め打ちでこう進める

### 1. Blender側の中核を決める

**Blenderは `PatrykIti/blender-ai-mcp` 型を中核にする。**

理由は、単にBlenderを操作するだけでなく、goal-first routing、curated tools、deterministic verificationを重視しているからです。プロ品質に必要なのは「bpyを叩けること」より、**測定・検証・修正ループ**です。`PatrykIti/blender-ai-mcp` はApache-2.0ライセンスです。([GitHub][1])

`ahujasid/blender-mcp` は基本接続・Blender addon・viewport screenshot・外部アセット連携の参考にします。`sandraschi/blender-mcp` は機能盛り構成の参考にします。3D-Agentは外します。([GitHub][2])

Blender MVPで最初に作るtoolはこれだけでいいです。

```text
blender.inspect_scene
blender.create_asset
blender.modify_asset
blender.apply_material
blender.render_preview
blender.optimize_glb
blender.validate_asset
blender.export_game_ready
```

裏側で使うもの：

```text
PatrykIti型 Blender bridge
+ glTF-Transform
+ meshoptimizer / gltfpack
+ xatlas
+ OpenImageIO / OpenColorIO
+ FFmpeg preview
```

GPL系は最初から直混ぜしないで、optional adapterにします。

```text
blender-gpl-adapters/
  blenderproc_adapter
  blendergis_adapter
  sverchok_adapter
```

GPLの扱いは、GNU GPL FAQでも pipes / sockets / command-line arguments は通常、別プログラム間の通信として扱われると説明されています。ただし、通信内容が密接すぎると結合物と見られる可能性があります。だから、GPL系は**外部プロセス/CLI/Blender addon adapter**として分けるのが安全です。([GNU][3])

---

### 2. Premiere側の中核を決める

**Premiereは `leancoderkavy/premiere-pro-mcp` 型を中核にする。**

理由は、macOS/Windows両対応を狙いやすく、Premiere操作範囲も広いからです。READMEでは、AIからPremiere Proを直接操作し、メディア取り込み、タイムライン編集、エフェクト、キーフレーム、書き出しなどを扱うMCPと説明されています。([GitHub][4])

`ayushozha/AdobePremiereProMCP` は最大火力の設計参考。
`hetpatel-11/Adobe_Premiere_Pro_MCP` は検証・安全思想の参考。
`antipaster/Adobe-Premiere-Pro-MCP` は**Windows adapter参考**にします。

`antipaster` はREADMEのRequirementsに **Windows** と明記されています。構成は Node.js MCP Server → WebSocket → CEP Panel → ExtendScript → Premiere Pro です。なので、Macでもそのまま同様に使える前提にはしません。([GitHub][5])

Premiere MVPで最初に作るtoolはこれだけでいいです。

```text
premiere.ingest_media
premiere.index_media
premiere.create_sequence
premiere.make_rough_cut
premiere.auto_caption
premiere.mix_audio
premiere.export_video
premiere.run_qc
```

裏側で使うもの：

```text
leancoderkavy型 Premiere bridge
+ FFmpeg / ffprobe
+ MediaInfo
+ OpenTimelineIO
+ WhisperX or faster-whisper
+ PySceneDetect
+ Auto-Editor
+ pyloudnorm
```

---

## 3. リポジトリ構成を先に作る

次にやるべき具体作業は、**コードを書く前にこの構成を作ること**です。

```text
creative-pipeline-mcp/
  packages/
    core/
      src/
        toolRegistry.ts
        router.ts
        jobQueue.ts
        approvalPolicy.ts
        qcReport.ts
        artifactStore.ts
        licenseManifest.ts

    blender-pro-mcp/
      src/
        server.ts
        tools/
          inspectScene.ts
          createAsset.ts
          renderPreview.ts
          optimizeGlb.ts
          validateAsset.ts
          exportGameReady.ts
        adapters/
          blenderRpc.ts
          gltfTransform.ts
          meshoptimizer.ts
          xatlas.ts

    blender-gpl-adapters/
      LICENSE: GPL-3.0-or-later
      src/
        blenderprocAdapter.ts
        blendergisAdapter.ts
        sverchokAdapter.ts

    premiere-pro-mcp/
      src/
        server.ts
        tools/
          ingestMedia.ts
          indexMedia.ts
          createSequence.ts
          makeRoughCut.ts
          autoCaption.ts
          mixAudio.ts
          exportVideo.ts
          runQc.ts
        adapters/
          premiereCep.ts
          ffmpeg.ts
          mediainfo.ts
          opentimelineio.ts
          whisper.ts
          scenedetect.ts
          loudness.ts

    premiere-windows-adapter/
      src/
        websocketCepBridge.ts

  third_party_licenses/
  examples/
  docs/
```

ライセンス方針はこれ。

```text
core:
  Apache-2.0

blender-pro-mcp:
  Apache-2.0

premiere-pro-mcp:
  Apache-2.0 or MIT

blender-gpl-adapters:
  GPL-3.0-or-later

third_party_licenses:
  依存OSSのLICENSE/NOTICEを全部保存
```

公開前提ならGPL adapterを入れてもいいです。
ただし、**coreとGPL adapterを分ける**のが大事です。

---

## 4. AIに見せるtoolは少なくする

内部にOSSを大量に入れても、AIに100個も200個もtoolを見せないほうがいいです。

最初はこのくらいで十分です。

### Blender用

```text
blender.create_game_asset
blender.create_scene
blender.optimize_asset
blender.validate_asset
blender.render_preview
blender.export_game_ready
```

### Premiere用

```text
premiere.ingest_media
premiere.make_rough_cut
premiere.auto_caption
premiere.mix_audio
premiere.export_social_variants
premiere.run_delivery_qc
```

細かい処理は内部routerが選びます。

```text
premiere.make_rough_cut
  ↓
WhisperX
  ↓
PySceneDetect
  ↓
OpenTimelineIO
  ↓
Premiere bridge
  ↓
QC
```

こうしないと、AIが大量toolで迷います。

---

## 5. 最初のMVP目標

最初の完成目標はこの2つです。

### Blender MVP

入力：

```text
「低容量のSFドアを作って、ゲーム向けGLBで出して、品質チェックして」
```

出力：

```text
door.glb
door_preview.mp4
door_qc_report.json
```

QC項目：

```text
- poly count
- object scale
- origin
- normals
- UV overlap
- missing textures
- texture size
- GLB export success
```

### Premiere MVP

入力：

```text
「この素材から60秒の縦動画を作って、字幕を入れて、音量を整えて、書き出してQCして」
```

出力：

```text
final_1080x1920.mp4
captions.srt
timeline.otio
delivery_qc_report.json
```

QC項目：

```text
- resolution
- fps
- duration
- codec
- loudness
- clipping
- silent gaps
- black frames
- caption overlap
```

---

## 6. 実装順はこれ

次にやる順番はこれがベストです。

```text
Step 1:
  creative-mcp-core の空プロジェクトを作る

Step 2:
  Blender用MCPとPremiere用MCPを別packageで作る

Step 3:
  tool registry / router / job queue / qc report の共通仕様を作る

Step 4:
  Blenderは inspect_scene / render_preview / validate_asset から実装

Step 5:
  Premiereは ingest_media / index_media / run_qc から実装

Step 6:
  書き込み系toolを追加する

Step 7:
  GPL adaptersを optional として追加する

Step 8:
  Dashboard / job history / approval queue を追加する
```

最初から「生成」ではなく、**inspect / validate / QC**から作るのが正解です。
プロ品質は、作る力より先に、壊れたものを検出する力が必要です。

---

## 7. 次の具体的な一手

今すぐやるべき一手はこれです。

**`creative-pipeline-mcp` の設計書を1枚作る。**

中身はこの5項目です。

```text
1. 目的
  BlenderとPremiereのプロ制作パイプラインをMCP化する

2. スコープ
  Blender Pro MCP
  Premiere Pro MCP
  GPL adapters
  QC system

3. 採用ベース
  Blender: PatrykIti型
  Premiere: leancoderkavy型
  Windows参考: antipaster
  3D-Agent: 除外

4. 最初のmacro tools
  blender.create_game_asset
  blender.validate_asset
  premiere.make_rough_cut
  premiere.run_delivery_qc

5. ライセンス方針
  coreはApache/MIT
  GPL系はoptional adapters
  third_party_licensesを同梱
```

その次に、空のmonorepoを作って、**まずQCだけ動くMCP**にします。

最初の実装ゴールはこれです。

```text
Blender:
  既存 .blend / .glb を読み込んでQC reportを出す

Premiere:
  既存動画を読み込んで ffmpeg / MediaInfo / loudness のQC reportを出す
```

これが通ったら、次に生成・編集機能を足せばいいです。

[1]: https://github.com/PatrykIti/blender-ai-mcp?utm_source=chatgpt.com "PatrykIti/blender-ai-mcp"
[2]: https://github.com/ahujasid/blender-mcp?utm_source=chatgpt.com "ahujasid/blender-mcp"
[3]: https://www.gnu.org/licenses/gpl-faq.html?utm_source=chatgpt.com "Frequently Asked Questions about the GNU Licenses"
[4]: https://github.com/leancoderkavy/premiere-pro-mcp?utm_source=chatgpt.com "leancoderkavy/premiere-pro-mcp: MCP server for ..."
[5]: https://github.com/antipaster/Adobe-Premiere-Pro-MCP?utm_source=chatgpt.com "antipaster/Adobe-Premiere-Pro-MCP"

以下が、**Blender用統合MCP** と **Premiere用統合MCP** を、公開前提・プロ品質前提で作るための全体ロードマップです。
結論としては、**「全部入り巨大MCP」ではなく、共通Core + Blender MCP + Premiere MCP + optional GPL adapters + QC system** に分けるのが一番強いです。

---

# 最終ゴール

作るものはこの3つです。

```text
creative-mcp-core
  共通基盤：router / job queue / approval / logging / artifact / QC / license manifest

blender-pro-mcp
  Blender制作：3D生成、最適化、マテリアル、レンダー、GLB/USD出力、QC

premiere-pro-mcp
  Premiere制作：素材解析、ラフカット、字幕、音声、タイムライン、書き出し、QC
```

さらにGPL系は分離します。

```text
blender-gpl-adapters
  BlenderProc / BlenderGIS / Sverchok など
```

3D-Agentは今回は除外でOKです。OSS統合MCPの部品としては使わないほうがいいです。

---

# 採用方針

## Blender側

**中核は `PatrykIti/blender-ai-mcp` 型。**
理由は、単なる `bpy` 実行ではなく、goal-first routing、curated tools、deterministic verification を重視しているからです。プロ品質では「操作できること」より「検証できること」が重要です。`PatrykIti/blender-ai-mcp` は production-shaped MCP server として、検証・ルーティング・安定tool APIを前面に出しています。([GitHub][1])

```text
Blender中核:
  PatrykIti型

参考:
  ahujasid/blender-mcp
  sandraschi/blender-mcp

除外:
  3D-Agent
```

## Premiere側

**中核は `leancoderkavy/premiere-pro-mcp` 型。**
理由は、Premiere ProをAIから直接操作し、メディア取り込み、タイムライン編集、エフェクト、キーフレーム、書き出しまで扱う実用バランス型だからです。([GitHub][2])

```text
Premiere中核:
  leancoderkavy型

参考:
  ayushozha/AdobePremiereProMCP
  hetpatel-11/Adobe_Premiere_Pro_MCP
  antipaster/Adobe-Premiere-Pro-MCP
```

`ayushozha` は最大火力・巨大設計の参考です。1,027 tools、Go + Rust + Python + TypeScript、CEP/ExtendScript bridgeという構成が説明されています。([GitHub][3])
`antipaster` はWindows向けの参考枠です。README上でも `install.bat` 前提の自動インストールが案内されているので、Mac中核にはしないほうがいいです。([GitHub][4])

---

# 全体アーキテクチャ

```text
creative-pipeline-mcp/
  packages/
    core/
      tool registry
      router
      job queue
      policy engine
      approval system
      artifact store
      logging
      QC report schema
      license manifest

    blender-pro-mcp/
      Blender bridge
      headless runner
      live session bridge
      asset tools
      material tools
      render tools
      export tools
      validation tools

    blender-gpl-adapters/
      BlenderProc adapter
      BlenderGIS adapter
      Sverchok adapter

    premiere-pro-mcp/
      Premiere CEP/ExtendScript bridge
      media indexer
      transcript tools
      scene detection tools
      timeline tools
      audio tools
      export tools
      delivery QC tools

    premiere-windows-adapter/
      WebSocket/CEP bridge参考
      antipaster型Windows bridge

    qc-tools/
      shared media QC
      shared asset QC
      reports

  third_party_licenses/
  examples/
  docs/
```

MCPのセキュリティでは、最小権限・段階的な権限昇格・低リスクの読み取り操作から始める方針が重要です。公式MCP security best practicesでも progressive least-privilege scope が推奨されています。([Model Context Protocol][5])

---

# Phase 0：設計・ライセンス・公開方針

## 目的

最初に、MCPを「AIが何でも触れる危険な巨大ツール」にせず、**プロ制作パイプラインの司令塔**として設計します。

## やること

```text
- monorepo構成を決める
- core / blender / premiere / gpl adapters を分ける
- ライセンス方針を決める
- 3D-Agentを除外する
- AIに見せるmacro toolの数を絞る
- 危険操作のapproval policyを決める
```

## ライセンス方針

```text
creative-mcp-core:
  Apache-2.0 or MIT

blender-pro-mcp:
  Apache-2.0 or MIT

premiere-pro-mcp:
  MIT or Apache-2.0

blender-gpl-adapters:
  GPL-3.0-or-later

third_party_licenses:
  依存OSSのLICENSE/NOTICEを全部同梱
```

GPL系を入れる場合、公開前提なら現実的です。ただし、coreへ直混ぜせず、**GPL adaptersとして分離**するのが安全です。GNU GPL FAQでは、pipes / sockets / command-line arguments で通信する別プログラムは通常別物として扱われる一方、密接な内部データ構造をやり取りするほど一体性が問題になり得ると説明されています。([GNU][6])

## 成果物

```text
/docs/ARCHITECTURE.md
/docs/LICENSING.md
/docs/SECURITY.md
/docs/ROADMAP.md
/third_party_licenses/
```

---

# Phase 1：creative-mcp-core

## 目的

BlenderとPremiereで共通に使う基盤を作ります。

## 実装するCore機能

```text
toolRegistry
  toolを登録・分類する

router
  macro toolから内部adapterを選ぶ

jobQueue
  重い処理をジョブとして実行する

approvalPolicy
  delete / overwrite / export / execute_script などを承認制にする

artifactStore
  生成物、プレビュー、QC report、ログを保存する

qcReport
  Blender/Premiere共通の検証結果schema

licenseManifest
  依存OSS、モデル、素材、生成物のライセンス記録

capabilityProfiles
  read-only / safe-write / full-control などの権限セット
```

## Coreの最初のAPI

```ts
registerTool(tool)
runJob(jobSpec)
requestApproval(action)
writeArtifact(path, data)
readArtifact(path)
emitQcReport(report)
resolveAdapter(capability)
```

## 成果物

```text
coreがMCP serverとして起動する
health checkできる
tool listを返せる
job queueが動く
QC report JSONを保存できる
approval required の挙動が動く
```

---

# Phase 2：QC-first MVP

ここが一番大事です。
最初から生成・編集を作るのではなく、**検証だけできるMCP**にします。

## Blender QC MVP

入力：

```text
既存 .blend / .glb / .gltf
```

出力：

```text
asset_qc_report.json
preview.png
```

検査項目：

```text
- polygon count
- object count
- bounding box
- scale
- origin
- normals
- non-manifold
- UV presence
- UV overlap
- missing textures
- material slots
- texture resolution
- glTF/GLB export validity
```

glTFは、3Dアセットのサイズと実行時の処理コストを減らすためのロイヤリティフリー仕様として説明されています。Blender側のMCPでは、GLB/glTF最適化を最初から品質ゲートに入れるべきです。([The Khronos Group][7])

## Premiere QC MVP

入力：

```text
既存 mp4 / mov / wav
```

出力：

```text
delivery_qc_report.json
thumbnails/
waveform.png
```

検査項目：

```text
- resolution
- fps
- duration
- codec
- bitrate
- audio channels
- loudness
- clipping
- silence gaps
- black frames
- caption file presence
```

FFmpegは動画・音声の記録、変換、ストリーム用のクロスプラットフォーム基盤です。Premiere MCPの周辺QCでは、ffmpeg/ffprobeを中心に置くのが自然です。([FFmpeg][8])

---

# Phase 3：Blender Pro MCP MVP

## 目的

Blenderで「作る → プレビュー → 最適化 → 検証 → 書き出し」までを1ループで回せるようにします。

## 最初に公開するmacro tools

```text
blender.inspect_scene
blender.render_preview
blender.validate_asset
blender.optimize_asset
blender.export_game_ready
```

## 内部adapter

```text
Blender bridge:
  live Blender session / headless Blender

glTF adapter:
  glTF-Transform

mesh adapter:
  meshoptimizer / gltfpack

UV adapter:
  xatlas

image adapter:
  OpenImageIO / OpenEXR

color adapter:
  OpenColorIO / ACES
```

glTF-Transformやmeshoptimizer系は、GLB/glTFの軽量化・最適化に使う枠です。KhronosのglTF説明でも、glTFはサイズ削減と実行時処理の軽減を狙った形式だとされています。([GitHub][9])

## MVPの成功条件

```text
入力:
  「このGLBをゲーム向けに最適化して検証して」

出力:
  optimized.glb
  preview.png
  asset_qc_report.json

QC:
  polygon budget pass
  missing textureなし
  GLB export success
  normals pass
  scale/origin pass
```

---

# Phase 4：Premiere Pro MCP MVP

## 目的

Premiereで「素材解析 → ラフカット → 字幕 → 音量 → 書き出し → QC」までを1ループで回せるようにします。

## 最初に公開するmacro tools

```text
premiere.ingest_media
premiere.index_media
premiere.make_rough_cut
premiere.auto_caption
premiere.mix_audio
premiere.export_video
premiere.run_delivery_qc
```

## 内部adapter

```text
Premiere bridge:
  leancoderkavy型 CEP/ExtendScript bridge

timeline:
  OpenTimelineIO

media:
  FFmpeg / ffprobe
  MediaInfo
  PyAV

speech:
  WhisperX / faster-whisper / whisper.cpp

scene:
  PySceneDetect

rough cut:
  Auto-Editor

audio:
  librosa
  pyloudnorm
  Demucs

quality:
  VMAF
```

OpenTimelineIOは、カットの順序・長さ・外部メディア参照を扱う編集タイムライン用の交換フォーマット/APIで、メディア自体のコンテナではありません。Premiere MCPでは、AIがまずOTIOで編集案を作り、それをPremiereに反映する設計が向いています。([GitHub][10])

WhisperXは高速ASR、単語単位タイムスタンプ、話者分離を提供するため、字幕生成・発話ベース編集・話者別カットの中核にできます。([GitHub][11])
PySceneDetectはショット変化検出とクリップ分割に使えるOSSなので、B-roll抽出やラフカット前処理に向いています。([SceneDetect][12])

## MVPの成功条件

```text
入力:
  「この素材から60秒の縦動画を作って、字幕を入れて、音量を整えて、書き出してQC」

出力:
  final_1080x1920.mp4
  captions.srt
  timeline.otio
  delivery_qc_report.json

QC:
  1080x1920
  target fps
  duration pass
  loudness pass
  clippingなし
  black frameなし
  caption overlapなし
```

---

# Phase 5：Macro tool化

ここからAIに見せるツールを減らします。
内部には大量のadapterがあっても、AIには大きな目的ベースtoolだけを見せます。

## Blender macro tools

```text
blender.create_game_asset
blender.create_scene
blender.create_material_pack
blender.optimize_asset
blender.validate_asset
blender.render_preview
blender.export_game_ready
blender.fix_asset_issues
```

## Premiere macro tools

```text
premiere.ingest_media
premiere.index_project
premiere.rough_cut_from_script
premiere.cut_interview
premiere.add_broll
premiere.auto_caption
premiere.mix_audio
premiere.export_social_variants
premiere.run_delivery_qc
premiere.fix_qc_issues
```

## 例：Blender内部フロー

```text
blender.create_game_asset
  ↓
scene planning
  ↓
Blender bridge
  ↓
material generation
  ↓
render preview
  ↓
glTF export
  ↓
mesh optimization
  ↓
asset QC
  ↓
fix loop
```

## 例：Premiere内部フロー

```text
premiere.rough_cut_from_script
  ↓
media indexing
  ↓
WhisperX transcript
  ↓
PySceneDetect shot list
  ↓
OpenTimelineIO rough timeline
  ↓
Premiere timeline insertion
  ↓
caption generation
  ↓
audio mix
  ↓
export
  ↓
delivery QC
```

---

# Phase 6：Blender GPL adapters

## 目的

GPL系を optional adapter として入れます。
公開前提なら使えますが、coreへ直混ぜしない設計にします。

## 入れるもの

```text
BlenderProc adapter
  procedural scene / synthetic rendering

BlenderGIS adapter
  terrain / GIS / OSM / GeoTIFF / DEM

Sverchok adapter
  parametric geometry / node-based shape generation
```

BlenderProcはGPL-3.0のprocedural Blender pipelineで、photorealistic renderingを目的としたツールです。([GitHub][13])
BlenderGISはShapefile、raster、GeoTIFF DEM、OpenStreetMap XMLなどのGISデータをBlenderに取り込むaddonです。([GitHub][14])
SverchokはBlender用のparametric CAD / node-based geometry toolです。([Nortikin][15])

## 実装方式

```text
core
  ↓ JSON job
gpl adapter
  ↓ external process / Blender addon / CLI
GPL tool
  ↓ output files + JSON result
core
```

## 成果物

```text
blender.generate_procedural_scene
blender.generate_gis_terrain
blender.generate_parametric_asset
```

---

# Phase 7：Blender高品質化

## 目的

ゲーム・映像・商品ビジュアル向けに、見た目とデータ品質を上げます。

## 追加する機能

```text
material pipeline:
  Material Maker
  MaterialX
  OpenShadingLanguage

color pipeline:
  OpenColorIO
  ACES

image pipeline:
  OpenImageIO
  OpenEXR

scene interchange:
  OpenUSD

volume / simulation:
  OpenVDB

subdivision:
  OpenSubdiv
```

Material Makerは、Godotベースのprocedural texture authoring / 3D model paintingツールで、ノード接続でテクスチャやブラシを作れます。([GitHub][16])

## 追加QC

```text
- PBR map completeness
- base color / normal / roughness / metallic確認
- texture color space
- material slot naming
- UV island density
- export target profile
- render turntable
- visual diff
```

---

# Phase 8：Premiere高品質化

## 目的

プロ編集に必要な「音・字幕・テンポ・納品仕様」を強化します。

## 追加する機能

```text
audio intelligence:
  pyloudnorm
  librosa
  Demucs

video quality:
  VMAF
  black frame detector
  visual diff

subtitle:
  Subtitle Edit integration
  SRT / VTT / ASS validation

timeline:
  OTIO diff
  revision compare
  edit decision report

delivery:
  export presets
  platform profiles
  social variants
```

pyloudnormはITU-R BS.1770-4に基づくPython loudness meter実装です。([GitHub][17])
VMAFはNetflix開発の知覚的動画品質評価アルゴリズムで、libvmafとPython wrapperを含みます。([GitHub][18])

## 追加QC

```text
- LUFS target
- true peak
- clipping
- silence longer than threshold
- caption overlap
- caption reading speed
- black frame
- duplicate frame
- visual quality score
- export codec / bitrate / fps / resolution
```

---

# Phase 9：安全・承認・サンドボックス

## 目的

「AIが壊す」事故を防ぎます。

## 権限レベル

```text
read_only:
  inspect / index / QCのみ

safe_write:
  新規ファイル生成、コピーへの編集のみ

project_write:
  現在のプロジェクトに編集可能

destructive:
  delete / overwrite / publish / execute raw script

admin:
  shell / plugin install / system setting
```

## 承認必須操作

```text
- delete
- overwrite
- publish
- execute_raw_bpy
- execute_extendscript
- shell command
- external upload
- cloud sync
- GPL adapter activation
- export final delivery
```

## ログ

```text
tool call log
input/output snapshot
artifact hash
before/after diff
approval record
QC report
license manifest
```

---

# Phase 10：Dashboard

## 目的

WEPPYっぽい「実行履歴・変更履歴・QC・プレビュー」を見られるUIを作ります。

## Dashboard機能

```text
Jobs
  実行中/完了/失敗

Artifacts
  preview, renders, exports, reports

QC
  pass/fail, blocking issues, suggested fixes

Approvals
  pending destructive actions

License
  dependencies, assets, generated files

Timeline
  Premiere rough cut previews

Scene
  Blender asset previews
```

## 成果物

```text
web dashboard
job detail page
QC report viewer
artifact browser
approval queue
```

---

# Phase 11：公開準備

## 目的

OSSとして公開できる状態にします。

## 必要ファイル

```text
README.md
LICENSE
NOTICE
SECURITY.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
docs/ARCHITECTURE.md
docs/INSTALL_BLENDER.md
docs/INSTALL_PREMIERE.md
docs/LICENSING.md
docs/GPL_ADAPTERS.md
docs/SAFETY.md
examples/
third_party_licenses/
```

## READMEで明記すること

```text
- 非公式ツールであること
- Blender / Adobe / Premiereの商標を所有しないこと
- 3D-Agentは含まないこと
- GPL adaptersはoptionalであること
- destructive operationsは承認制であること
- 本番ファイルでは必ずコピーを使うこと
```

GPLv3は、配布時に対応するソースコードを利用可能にし、受領者に追加制限を課さないことを求めるライセンスです。GPL adaptersを配布する場合は、ソース・LICENSE・変更点の扱いをきちんと整える必要があります。([GNU][6])

---

# Phase 12：Alpha版

## Alphaの範囲

```text
Blender:
  inspect
  render preview
  validate asset
  optimize GLB
  export game-ready

Premiere:
  ingest
  index
  transcript
  rough cut
  auto caption
  loudness check
  export QC
```

## Alphaでやらないこと

```text
- 完全自動の最終作品生成
- 複雑なVFX合成
- 高度な手動カラーグレーディング完全代替
- 商標入りテンプレート配布
- 3D-Agent統合
```

## Alpha成功条件

```text
Blender:
  既存GLBを最適化してQC reportを出せる

Premiere:
  既存動画を解析して、字幕・音声QC・簡単なラフカットができる

共通:
  全tool callがログに残る
  destructive operationが承認制になる
  LICENSE/NOTICEが揃う
```

---

# Phase 13：Beta版

## Betaで追加

```text
Blender:
  create_game_asset
  material pack generation
  BlenderProc adapter
  BlenderGIS adapter
  Sverchok adapter
  render turntable
  asset repair loop

Premiere:
  cut_interview
  add_broll
  mix_audio
  export_social_variants
  VMAF check
  caption timing fixer
  OTIO revision diff
```

## Beta成功条件

```text
Blender:
  「ゲーム向け低容量アセット作成」タスクが一通り完了する

Premiere:
  「60秒縦動画作成」タスクが一通り完了する

共通:
  Dashboardでjob/QC/artifact/approvalが見える
```

---

# Phase 14：v1.0

## v1.0の条件

```text
- Blender/Premiereの主要macro toolsが安定
- QC reportが標準化
- GPL adaptersがoptionalとして分離
- 安全ポリシーが実装済み
- Mac/Windowsの導入手順が分かれている
- examplesが動く
- CIでlint/test/buildが通る
- third_party_licensesが揃う
- dangerous toolsはデフォルトoff
```

## v1.0で公開するtool一覧

### Blender

```text
blender.inspect_scene
blender.render_preview
blender.validate_asset
blender.optimize_asset
blender.export_game_ready
blender.create_game_asset
blender.create_material_pack
blender.fix_asset_issues
```

### Premiere

```text
premiere.ingest_media
premiere.index_media
premiere.make_rough_cut
premiere.auto_caption
premiere.mix_audio
premiere.export_video
premiere.run_delivery_qc
premiere.fix_qc_issues
```

### Optional GPL

```text
blender.generate_procedural_scene
blender.generate_gis_terrain
blender.generate_parametric_asset
```

---

# Phase 15：v2.0以降

## Blender v2

```text
- USD pipeline
- MaterialX workflow
- OCIO/ACES color workflow
- OpenVDB volume support
- advanced rig/animation tools
- topology auto-repair
- target engine profiles: Roblox / Unity / Unreal / WebGL
```

## Premiere v2

```text
- multi-platform delivery profiles
- brand package system
- advanced B-roll selection
- speaker-aware interview editing
- podcast/video repurposing
- edit style presets
- multi-language subtitles
- automated thumbnail generation
```

## Creative Pipeline v2

```text
- Director Agent
- Blender → Premiere asset handoff
- asset manifest
- edit manifest
- full production report
- multi-agent review
```

---

# 最初に作るべきMVP仕様

## MVP 1：Blender Asset QC MCP

```text
Input:
  model.glb

Process:
  inspect
  preview render
  validate
  optimize
  validate again

Output:
  model_optimized.glb
  preview.png
  asset_qc_report.json
```

## MVP 2：Premiere Media QC MCP

```text
Input:
  source.mp4

Process:
  ffprobe
  MediaInfo
  PySceneDetect
  WhisperX
  loudness check
  black/silence check

Output:
  transcript.json
  scenes.json
  thumbnails/
  media_qc_report.json
```

## MVP 3：Premiere Rough Cut MCP

```text
Input:
  source.mp4
  brief.txt

Process:
  transcript
  scene detection
  rough timeline OTIO
  Premiere timeline build
  caption
  export
  QC

Output:
  rough_cut.prproj
  rough_cut.otio
  captions.srt
  preview.mp4
  delivery_qc_report.json
```

---

# リスクと対策

| リスク               | 対策                                      |
| ----------------- | --------------------------------------- |
| AIがtool選択を間違える    | macro tool中心にする                         |
| GPLがcoreに波及する     | GPL adaptersを分離する                       |
| Premiere APIが不安定  | leancoderkavy型を中核、raw scriptは承認制        |
| Blenderで壊れたモデルを作る | QC-first、validate/fix loop              |
| 大量toolで遅くなる       | tool search / lazy loading              |
| 破壊操作事故            | approval required                       |
| 書き出し品質ミス          | FFmpeg / pyloudnorm / VMAF / caption QC |
| 商標トラブル            | 非公式表記、互換性表記のみ                           |
| 依存関係が重すぎる         | optional adapters化                      |
| Mac/Windows差分     | core共通、platform adapter分離               |

---

# 最終ロードマップまとめ

```text
Phase 0:
  設計・ライセンス・公開方針

Phase 1:
  creative-mcp-core

Phase 2:
  QC-first MVP

Phase 3:
  Blender Pro MCP MVP

Phase 4:
  Premiere Pro MCP MVP

Phase 5:
  macro tool化

Phase 6:
  Blender GPL adapters

Phase 7:
  Blender高品質化

Phase 8:
  Premiere高品質化

Phase 9:
  安全・承認・サンドボックス

Phase 10:
  Dashboard

Phase 11:
  公開準備

Phase 12:
  Alpha

Phase 13:
  Beta

Phase 14:
  v1.0

Phase 15:
  v2.0以降
```

一番重要なのは、**生成機能より先にQC機能を作ること**です。
この順番なら、ただの「AIでBlender/Premiereを操作するMCP」ではなく、**制作会社の内製パイプラインをMCP化したような、かなりプロ寄りの統合環境**になります。

[1]: https://github.com/PatrykIti/blender-ai-mcp?utm_source=chatgpt.com "PatrykIti/blender-ai-mcp"
[2]: https://github.com/leancoderkavy/premiere-pro-mcp?utm_source=chatgpt.com "leancoderkavy/premiere-pro-mcp: MCP server for ..."
[3]: https://github.com/modelcontextprotocol/servers/issues/3646?utm_source=chatgpt.com "Add Adobe Premiere Pro MCP server (1000+ tools) #3646"
[4]: https://github.com/antipaster/Adobe-Premiere-Pro-MCP?utm_source=chatgpt.com "antipaster/Adobe-Premiere-Pro-MCP"
[5]: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices?utm_source=chatgpt.com "Security Best Practices"
[6]: https://www.gnu.org/licenses/gpl-3.0.en.html?utm_source=chatgpt.com "The GNU General Public License v3.0"
[7]: https://www.khronos.org/gltf/?utm_source=chatgpt.com "glTF - Runtime 3D Asset Delivery"
[8]: https://ffmpeg.org/?utm_source=chatgpt.com "FFmpeg"
[9]: https://github.com/khronosgroup/gltf?utm_source=chatgpt.com "KhronosGroup/glTF: glTF – Runtime 3D Asset Delivery"
[10]: https://github.com/AcademySoftwareFoundation/OpenTimelineIO?utm_source=chatgpt.com "AcademySoftwareFoundation/OpenTimelineIO"
[11]: https://github.com/m-bain/whisperx?utm_source=chatgpt.com "WhisperX: Automatic Speech Recognition with Word- ..."
[12]: https://www.scenedetect.com/?utm_source=chatgpt.com "PySceneDetect: Home"
[13]: https://github.com/DLR-RM/BlenderProc?utm_source=chatgpt.com "DLR-RM/BlenderProc: A procedural Blender pipeline for ..."
[14]: https://github.com/domlysz/blendergis?utm_source=chatgpt.com "domlysz/BlenderGIS: Blender addons to make the bridge ..."
[15]: https://nortikin.github.io/sverchok/?utm_source=chatgpt.com "Sverchok parametric tool"
[16]: https://github.com/RodZill4/material-maker?utm_source=chatgpt.com "RodZill4/material-maker"
[17]: https://github.com/csteinmetz1/pyloudnorm?utm_source=chatgpt.com "csteinmetz1/pyloudnorm: Flexible audio loudness meter in ..."
[18]: https://github.com/Netflix/vmaf?utm_source=chatgpt.com "VMAF - Video Multi-Method Assessment Fusion"
