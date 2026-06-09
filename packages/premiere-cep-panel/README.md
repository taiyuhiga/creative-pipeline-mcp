# Premiere CEP Panel Scaffold

This is a minimal CEP-side scaffold for the `premiere.build_timeline_from_otio` file-based IPC queue.

Install the folder as a CEP extension during development, open the panel in Premiere Pro, set the queue directory, then refresh the queue and run selected commands or all pending commands. The panel writes status JSON files next to the queue under `cep_status`.

To preload the queue directory, create `premiere-cep.json` in the installed extension folder:

```json
{
  "queueDir": "/absolute/path/to/artifacts/premiere/cep_queue",
  "statusDir": "/absolute/path/to/artifacts/premiere/cep_status"
}
```

The fallback installer writes this config automatically when no existing config is present.

The host script is intentionally conservative: it validates command types and creates/logs sequence/export/brand/typed edit requests without allowing arbitrary ExtendScript.

Create a distributable unsigned package from the repository root:

```bash
npm run package:premiere-cep -- --verify
```

The package script validates required files, manifest id/version, and ZIP integrity. If Adobe `ZXPSignCmd` and signing credentials are available, sign a ZXP with:

```bash
ZXPSIGNCMD_BIN=/path/to/ZXPSignCmd CEP_SIGN_CERT=/path/to/cert.p12 CEP_SIGN_PASSWORD=secret npm run package:premiere-cep -- --sign
```

The scaffold can be signed and packaged, but production deployment still depends on the project's Adobe extension signing certificate and installer policy. Keep `.p12` signing certificates in ignored local paths such as `certs/`; they contain private keys and must not be committed.
