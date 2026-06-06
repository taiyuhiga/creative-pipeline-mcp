# Premiere CEP Panel Scaffold

This is a minimal CEP-side scaffold for the `premiere.build_timeline_from_otio` file-based IPC queue.

Install the folder as a CEP extension during development, open the panel in Premiere Pro, set the queue directory, then click **Poll Once**. The host script is intentionally conservative: it validates command types and creates/logs sequence requests without allowing arbitrary ExtendScript.

This scaffold is not a signed production installer.

