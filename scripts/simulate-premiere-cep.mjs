#!/usr/bin/env node
import vm from "node:vm";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const options = parseArgs(process.argv.slice(2));
mkdirSync(options.queueDir, { recursive: true });
mkdirSync(options.statusDir, { recursive: true });
mkdirSync(options.archiveDir, { recursive: true });

const state = {
  imported: [],
  inserted: [],
  exports: [],
  sequences: [],
  trims: [],
  moves: [],
  markers: [],
  speeds: []
};
const context = createCepContext(state);
vm.createContext(context);
vm.runInContext(readFileSync(resolve(root, "packages/premiere-cep-panel/jsx/host.jsx"), "utf8"), context, {
  filename: "host.jsx"
});

let processed = 0;
const pending = readdirSync(options.queueDir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => {
    const commandPath = join(options.queueDir, file);
    return {
      file,
      commandPath,
      command: JSON.parse(readFileSync(commandPath, "utf8"))
    };
  })
  .sort((left, right) => {
    const leftPriority = commandPriority(left.command);
    const rightPriority = commandPriority(right.command);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.file < right.file ? -1 : left.file > right.file ? 1 : 0;
  });
for (const item of pending) {
  if (processed >= options.maxCommands) {
    break;
  }
  const { commandPath, command, file } = item;
  const status = dispatch(context, command);
  status.command = command;
  status.processedAt = new Date().toISOString();
  writeFileSync(join(options.statusDir, `${command.id}.json`), `${JSON.stringify(status, null, 2)}\n`, "utf8");
  renameSync(commandPath, join(options.archiveDir, file));
  processed += 1;
}

console.log(JSON.stringify({
  ok: true,
  processed,
  queueDir: options.queueDir,
  statusDir: options.statusDir,
  archiveDir: options.archiveDir,
  state
}, null, 2));

function dispatch(context, command) {
  try {
    const raw = context.CreativePipelineMCP.dispatch(JSON.stringify(command));
    if (typeof raw !== "string") {
      throw new Error("CEP dispatch did not return a JSON string");
    }
    const status = JSON.parse(raw);
    if (!status || status.schema !== "creative.pipeline.premiere.status.v1") {
      throw new Error("CEP dispatch returned invalid status schema");
    }
    return status;
  } catch (error) {
    return {
      schema: "creative.pipeline.premiere.status.v1",
      commandId: command.id ?? null,
      commandType: command.type ?? "unknown",
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      details: {},
      finishedAt: new Date().toISOString()
    };
  }
}

function createCepContext(state) {
  const project = {
    rootItem: makeRootItem([]),
    activeSequence: null,
    importFiles(paths) {
      for (let index = 0; index < paths.length; index += 1) {
        const mediaPath = paths[index];
        if (!this.rootItem.children.find((item) => item.getMediaPath() === mediaPath)) {
          this.rootItem.children.push(makeProjectItem(mediaPath));
          this.rootItem.children.numItems = this.rootItem.children.length;
          state.imported.push(mediaPath);
        }
      }
    },
    createNewSequence(name) {
      const sequence = makeSequence(name, state);
      this.activeSequence = sequence;
      state.sequences.push(name);
    }
  };
  return {
    JSON,
    Date,
    Error,
    String,
    Array,
    CreativePipelineMCP: {},
    File: makeFileClass(),
    app: {
      project,
      encoder: {
        launchEncoder() {},
        encodeSequence(sequence, outputPath, presetPath) {
          state.exports.push({
            sequenceName: sequence.name,
            outputPath,
            presetPath
          });
        }
      }
    }
  };
}

function commandPriority(command) {
  if (command.type === "build_timeline_from_otio") {
    return 0;
  }
  if (command.type === "trim_clip" || command.type === "split_clip" || command.type === "move_clip" || command.type === "set_clip_speed") {
    return 2;
  }
  if (command.type === "add_marker") {
    return 4;
  }
  if (command.type === "apply_timeline_markers") {
    return 5;
  }
  if (command.type === "apply_brand_package") {
    return 6;
  }
  if (command.type === "export_sequence") {
    return 7;
  }
  return 99;
}

function makeSequence(name, state) {
  const clips = [];
  clips.numItems = clips.length;
  const track = {
    clips,
    insertClip(item, startSeconds) {
      const clip = makeClip(item.getMediaPath(), startSeconds, state);
      clips.push(clip);
      clips.numItems = clips.length;
      state.inserted.push({
        mediaPath: item.getMediaPath(),
        startSeconds
      });
    }
  };
  const videoTracks = [track];
  videoTracks.numTracks = videoTracks.length;
  const audioTracks = [];
  audioTracks.numTracks = audioTracks.length;
  return {
    name,
    videoTracks,
    audioTracks,
    markers: {
      createMarker(timeSeconds) {
        const marker = { timeSeconds, name: "", comments: "", end: null };
        state.markers.push(marker);
        return marker;
      }
    }
  };
}

function makeClip(mediaPath, startSeconds, state) {
  const clip = {
    mediaPath,
    start: { seconds: startSeconds },
    end: { seconds: startSeconds + 1 },
    inPoint: { seconds: 0 },
    outPoint: { seconds: 1 },
    setSpeed(speedPercent, maintainPitch) {
      state.speeds.push({ mediaPath, speedPercent, maintainPitch });
      this.speedPercent = speedPercent;
      this.maintainPitch = maintainPitch;
    }
  };
  const recordChange = (kind) => {
    state[kind].push({
      mediaPath,
      start: clip.start.seconds,
      end: clip.end.seconds,
      inPoint: clip.inPoint.seconds,
      outPoint: clip.outPoint.seconds
    });
  };
  for (const [property, kind] of [["start", "moves"], ["end", "trims"], ["inPoint", "trims"], ["outPoint", "trims"]]) {
    let seconds = clip[property].seconds;
    Object.defineProperty(clip[property], "seconds", {
      get() {
        return seconds;
      },
      set(value) {
        seconds = value;
        recordChange(kind);
      }
    });
  }
  return clip;
}

function makeRootItem(items) {
  const children = [...items];
  children.numItems = children.length;
  return { children };
}

function makeProjectItem(mediaPath) {
  return {
    children: makeRootItem([]).children,
    getMediaPath() {
      return mediaPath;
    }
  };
}

function makeFileClass() {
  return class File {
    constructor(path) {
      this.path = path;
      this.exists = existsSync(path);
      this.text = "";
    }

    open() {
      if (!this.exists) {
        return false;
      }
      this.text = readFileSync(this.path, "utf8");
      return true;
    }

    read() {
      return this.text;
    }

    close() {}
  };
}

function parseArgs(args) {
  const parsed = {
    queueDir: resolve(process.env.CREATIVE_MCP_PREMIERE_IPC_DIR ?? "artifacts/premiere/cep_queue"),
    statusDir: resolve(process.env.CREATIVE_MCP_PREMIERE_STATUS_DIR ?? "artifacts/premiere/cep_status"),
    archiveDir: "",
    maxCommands: Number.POSITIVE_INFINITY
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [key, inlineValue] = arg.split("=", 2);
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined && ["--queue", "--status", "--archive", "--max-commands"].includes(key)) {
      index += 1;
    }
    if (key === "--queue") parsed.queueDir = resolve(value);
    else if (key === "--status") parsed.statusDir = resolve(value);
    else if (key === "--archive") parsed.archiveDir = resolve(value);
    else if (key === "--max-commands") parsed.maxCommands = Math.max(1, Number(value) || 1);
  }
  parsed.archiveDir ||= join(parsed.queueDir, "processed");
  mkdirSync(dirname(parsed.archiveDir), { recursive: true });
  return parsed;
}
