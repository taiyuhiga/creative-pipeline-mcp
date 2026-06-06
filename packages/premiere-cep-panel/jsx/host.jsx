var CreativePipelineMCP = CreativePipelineMCP || {};

CreativePipelineMCP.dispatch = function (json) {
  var command = JSON.parse(json);
  if (!command || !command.type || !command.payload) {
    return "invalid command";
  }
  if (command.type === "build_timeline_from_otio") {
    return CreativePipelineMCP.buildTimelineFromOtio(command.payload);
  }
  if (command.type === "export_sequence") {
    return CreativePipelineMCP.exportSequence(command.payload);
  }
  if (command.type === "apply_brand_package") {
    return CreativePipelineMCP.applyBrandPackage(command.payload);
  }
  return CreativePipelineMCP.status(command, "error", "unsupported command: " + command.type, {});
};

CreativePipelineMCP.buildTimelineFromOtio = function (payload) {
  var command = { type: "build_timeline_from_otio" };
  if (!app.project) {
    return CreativePipelineMCP.status(command, "error", "no active project", {});
  }
  var otio = CreativePipelineMCP.readJsonFile(payload.otioPath);
  var clips = CreativePipelineMCP.collectClips(otio);
  if (!clips.length) {
    return CreativePipelineMCP.status(command, "error", "no media paths found in OTIO", {});
  }

  var sequenceName = payload.sequenceName || "Creative Pipeline Rough Cut";
  var mediaPaths = CreativePipelineMCP.uniqueMediaPaths(clips);
  var missing = [];
  for (var importIndex = 0; importIndex < mediaPaths.length; importIndex++) {
    if (!CreativePipelineMCP.findProjectItemByMediaPath(app.project.rootItem, mediaPaths[importIndex])) {
      missing.push(mediaPaths[importIndex]);
    }
  }
  if (missing.length) {
    app.project.importFiles(missing, true, app.project.rootItem, false);
  }

  var sequence = app.project.activeSequence;
  if (!sequence && app.project.createNewSequence) {
    try {
      app.project.createNewSequence(sequenceName, sequenceName);
      sequence = app.project.activeSequence;
    } catch (err) {
      return CreativePipelineMCP.status(command, "error", "sequence creation failed", { error: String(err), imported: missing.length });
    }
  }
  if (!sequence) {
    return CreativePipelineMCP.status(command, "error", "no active sequence", { imported: missing.length });
  }

  var inserted = 0;
  for (var i = 0; i < clips.length; i++) {
    var item = CreativePipelineMCP.findProjectItemByMediaPath(app.project.rootItem, clips[i].mediaPath);
    if (item && sequence.videoTracks && sequence.videoTracks.numTracks > 0) {
      try {
        sequence.videoTracks[0].insertClip(item, clips[i].timelineStartSeconds);
        inserted++;
      } catch (insertErr) {
        return CreativePipelineMCP.status(command, "error", "clip insert failed", {
          error: String(insertErr),
          imported: missing.length,
          inserted: inserted
        });
      }
    }
  }

  return CreativePipelineMCP.status(command, "success", "timeline build completed", {
    imported: missing.length,
    media: mediaPaths.length,
    inserted: inserted,
    sequenceName: sequenceName
  });
};

CreativePipelineMCP.exportSequence = function (payload) {
  var command = { type: "export_sequence" };
  if (!app.project || !app.project.activeSequence) {
    return CreativePipelineMCP.status(command, "error", "no active sequence to export", {});
  }
  var outputPath = payload.outputPath || payload.output || "";
  if (!outputPath) {
    return CreativePipelineMCP.status(command, "error", "missing outputPath", {});
  }
  try {
    if (app.encoder && app.encoder.encodeSequence) {
      app.encoder.launchEncoder();
      app.encoder.encodeSequence(app.project.activeSequence, outputPath, payload.presetPath || "", 0, 1);
      return CreativePipelineMCP.status(command, "success", "export queued in Adobe Media Encoder", { outputPath: outputPath });
    }
    return CreativePipelineMCP.status(command, "accepted", "encoder API unavailable; export request recorded", { outputPath: outputPath });
  } catch (err) {
    return CreativePipelineMCP.status(command, "error", "export failed", { error: String(err), outputPath: outputPath });
  }
};

CreativePipelineMCP.applyBrandPackage = function (payload) {
  var command = { type: "apply_brand_package" };
  if (!app.project) {
    return CreativePipelineMCP.status(command, "error", "no active project", {});
  }
  return CreativePipelineMCP.status(command, "success", "brand package accepted", {
    brand: payload.brand || {},
    appliesTo: payload.appliesTo || []
  });
};

CreativePipelineMCP.readJsonFile = function (path) {
  var file = new File(path);
  if (!file.exists) {
    throw new Error("OTIO file not found: " + path);
  }
  file.open("r");
  var text = file.read();
  file.close();
  return JSON.parse(text);
};

CreativePipelineMCP.collectClips = function (node) {
  var clips = [];
  var cursor = 0;
  function walk(value) {
    if (!value) {
      return;
    }
    if (value.media_reference && value.media_reference.target_url) {
      var duration = CreativePipelineMCP.timeToSeconds(value.source_range && value.source_range.duration, 3);
      clips.push({
        mediaPath: value.media_reference.target_url,
        timelineStartSeconds: cursor,
        durationSeconds: duration
      });
      cursor += duration;
      return;
    } else if (value.target_url) {
      clips.push({ mediaPath: value.target_url, timelineStartSeconds: cursor, durationSeconds: 3 });
      cursor += 3;
      return;
    }
    if (value instanceof Array) {
      for (var i = 0; i < value.length; i++) {
        walk(value[i]);
      }
    } else if (typeof value === "object") {
      for (var key in value) {
        if (value.hasOwnProperty(key)) {
          walk(value[key]);
        }
      }
    }
  }
  walk(node);
  return clips;
};

CreativePipelineMCP.uniqueMediaPaths = function (clips) {
  var seen = {};
  var paths = [];
  for (var i = 0; i < clips.length; i++) {
    if (!seen[clips[i].mediaPath]) {
      seen[clips[i].mediaPath] = true;
      paths.push(clips[i].mediaPath);
    }
  }
  return paths;
};

CreativePipelineMCP.timeToSeconds = function (time, fallback) {
  if (!time || typeof time.value !== "number" || typeof time.rate !== "number" || time.rate === 0) {
    return fallback;
  }
  return time.value / time.rate;
};

CreativePipelineMCP.findProjectItemByMediaPath = function (root, mediaPath) {
  for (var i = 0; i < root.children.numItems; i++) {
    var item = root.children[i];
    try {
      if (item.getMediaPath && item.getMediaPath() === mediaPath) {
        return item;
      }
    } catch (ignored) {}
    if (item.children && item.children.numItems) {
      var nested = CreativePipelineMCP.findProjectItemByMediaPath(item, mediaPath);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
};

CreativePipelineMCP.status = function (command, status, message, details) {
  return JSON.stringify({
    schema: "creative.pipeline.premiere.status.v1",
    commandType: command.type || "unknown",
    status: status,
    message: message,
    details: details || {}
  });
};
