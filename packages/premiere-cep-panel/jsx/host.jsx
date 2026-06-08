var CreativePipelineMCP = CreativePipelineMCP || {};

CreativePipelineMCP.dispatch = function (json) {
  var command = null;
  try {
    command = JSON.parse(json);
    if (!command || !command.type || !command.payload) {
      return CreativePipelineMCP.status({ id: null, type: "unknown" }, "error", "invalid command", {});
    }
    if (command.type === "build_timeline_from_otio") {
      return CreativePipelineMCP.buildTimelineFromOtio(command);
    }
    if (command.type === "export_sequence") {
      return CreativePipelineMCP.exportSequence(command);
    }
    if (command.type === "apply_brand_package") {
      return CreativePipelineMCP.applyBrandPackage(command);
    }
    if (command.type === "apply_timeline_markers") {
      return CreativePipelineMCP.applyTimelineMarkers(command);
    }
    if (command.type === "trim_clip") {
      return CreativePipelineMCP.trimClip(command);
    }
    if (command.type === "split_clip") {
      return CreativePipelineMCP.splitClip(command);
    }
    if (command.type === "move_clip") {
      return CreativePipelineMCP.moveClip(command);
    }
    if (command.type === "add_marker") {
      return CreativePipelineMCP.addMarker(command);
    }
    if (command.type === "set_clip_speed") {
      return CreativePipelineMCP.setClipSpeed(command);
    }
    return CreativePipelineMCP.status(command, "error", "unsupported command: " + command.type, {});
  } catch (err) {
    return CreativePipelineMCP.status(command || { id: null, type: "unknown" }, "error", "dispatch failed", {
      error: String(err)
    });
  }
};

CreativePipelineMCP.buildTimelineFromOtio = function (command) {
  var payload = command.payload || {};
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

CreativePipelineMCP.exportSequence = function (command) {
  var payload = command.payload || {};
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

CreativePipelineMCP.applyBrandPackage = function (command) {
  var payload = command.payload || {};
  if (!app.project) {
    return CreativePipelineMCP.status(command, "error", "no active project", {});
  }
  return CreativePipelineMCP.status(command, "success", "brand package accepted", {
    brand: payload.brand || {},
    appliesTo: payload.appliesTo || []
  });
};

CreativePipelineMCP.applyTimelineMarkers = function (command) {
  var payload = command.payload || {};
  if (!app.project) {
    return CreativePipelineMCP.status(command, "error", "no active project", {});
  }
  return CreativePipelineMCP.status(command, "success", "timeline markers accepted", {
    markers: payload.markers || [],
    safeMargins: payload.safeMargins || {}
  });
};

CreativePipelineMCP.trimClip = function (command) {
  var payload = command.payload || {};
  var clip = CreativePipelineMCP.resolveClip(payload);
  if (!clip) {
    return CreativePipelineMCP.status(command, "error", "clip not found", { target: payload.target || {} });
  }
  var operation = payload.operation && payload.operation.trim ? payload.operation.trim : {};
  var changed = [];
  try {
    if (typeof operation.inPointSeconds === "number" && CreativePipelineMCP.setTimePropertySeconds(clip, "inPoint", operation.inPointSeconds)) {
      changed.push("inPoint");
    }
    if (typeof operation.outPointSeconds === "number" && CreativePipelineMCP.setTimePropertySeconds(clip, "outPoint", operation.outPointSeconds)) {
      changed.push("outPoint");
    }
    if (typeof operation.startSeconds === "number" && CreativePipelineMCP.setTimePropertySeconds(clip, "start", operation.startSeconds)) {
      changed.push("start");
    }
    if (typeof operation.endSeconds === "number" && CreativePipelineMCP.setTimePropertySeconds(clip, "end", operation.endSeconds)) {
      changed.push("end");
    }
    if (!changed.length) {
      return CreativePipelineMCP.status(command, "accepted", "trim command recorded; clip time properties were not writable", {
        target: payload.target || {},
        operation: operation
      });
    }
    return CreativePipelineMCP.status(command, "success", "clip trim applied", {
      target: payload.target || {},
      changed: changed
    });
  } catch (err) {
    return CreativePipelineMCP.status(command, "error", "clip trim failed", { error: String(err), target: payload.target || {} });
  }
};

CreativePipelineMCP.splitClip = function (command) {
  var payload = command.payload || {};
  var operation = payload.operation || {};
  var splitSeconds = operation.splitSeconds;
  if (!app.project || !app.project.activeSequence) {
    return CreativePipelineMCP.status(command, "error", "no active sequence", {});
  }
  if (typeof splitSeconds !== "number") {
    return CreativePipelineMCP.status(command, "error", "missing splitSeconds", {});
  }
  try {
    if (typeof qe !== "undefined" && qe.project && qe.project.getActiveSequence) {
      var qeSequence = qe.project.getActiveSequence();
      var target = payload.target || {};
      var qeTrack = target.trackType === "audio" && qeSequence.getAudioTrackAt
        ? qeSequence.getAudioTrackAt(target.trackIndex || 0)
        : qeSequence.getVideoTrackAt(target.trackIndex || 0);
      if (qeTrack && qeTrack.razor) {
        qeTrack.razor(String(splitSeconds));
        return CreativePipelineMCP.status(command, "success", "clip split applied", { splitSeconds: splitSeconds, target: target });
      }
    }
    return CreativePipelineMCP.status(command, "accepted", "split command recorded; QE razor API unavailable", {
      splitSeconds: splitSeconds,
      target: payload.target || {}
    });
  } catch (err) {
    return CreativePipelineMCP.status(command, "error", "clip split failed", { error: String(err), splitSeconds: splitSeconds });
  }
};

CreativePipelineMCP.moveClip = function (command) {
  var payload = command.payload || {};
  var clip = CreativePipelineMCP.resolveClip(payload);
  if (!clip) {
    return CreativePipelineMCP.status(command, "error", "clip not found", { target: payload.target || {} });
  }
  var operation = payload.operation || {};
  try {
    var changed = [];
    if (typeof operation.startSeconds === "number" && CreativePipelineMCP.setTimePropertySeconds(clip, "start", operation.startSeconds)) {
      changed.push("start");
    }
    if (typeof operation.targetTrackIndex === "number") {
      changed.push("targetTrackRecorded");
    }
    if (!changed.length) {
      return CreativePipelineMCP.status(command, "accepted", "move command recorded; clip start was not writable", {
        target: payload.target || {},
        operation: operation
      });
    }
    return CreativePipelineMCP.status(command, "success", "clip move applied or recorded", {
      target: payload.target || {},
      changed: changed
    });
  } catch (err) {
    return CreativePipelineMCP.status(command, "error", "clip move failed", { error: String(err), target: payload.target || {} });
  }
};

CreativePipelineMCP.addMarker = function (command) {
  var payload = command.payload || {};
  var operation = payload.operation || {};
  var markerSpec = operation.marker || {};
  if (!app.project || !app.project.activeSequence) {
    return CreativePipelineMCP.status(command, "error", "no active sequence", {});
  }
  if (typeof markerSpec.timeSeconds !== "number") {
    return CreativePipelineMCP.status(command, "error", "missing marker timeSeconds", {});
  }
  try {
    var markers = app.project.activeSequence.markers;
    if (markers && markers.createMarker) {
      var marker = markers.createMarker(markerSpec.timeSeconds);
      marker.name = markerSpec.name || "Creative Pipeline Marker";
      marker.comments = markerSpec.comments || "";
      if (typeof markerSpec.durationSeconds === "number") {
        marker.end = markerSpec.timeSeconds + markerSpec.durationSeconds;
      }
      return CreativePipelineMCP.status(command, "success", "marker added", { marker: markerSpec });
    }
    return CreativePipelineMCP.status(command, "accepted", "marker command recorded; sequence marker API unavailable", { marker: markerSpec });
  } catch (err) {
    return CreativePipelineMCP.status(command, "error", "marker add failed", { error: String(err), marker: markerSpec });
  }
};

CreativePipelineMCP.setClipSpeed = function (command) {
  var payload = command.payload || {};
  var clip = CreativePipelineMCP.resolveClip(payload);
  if (!clip) {
    return CreativePipelineMCP.status(command, "error", "clip not found", { target: payload.target || {} });
  }
  var operation = payload.operation || {};
  if (typeof operation.speedPercent !== "number") {
    return CreativePipelineMCP.status(command, "error", "missing speedPercent", {});
  }
  try {
    if (clip.setSpeed) {
      clip.setSpeed(operation.speedPercent, operation.maintainPitch === true);
      return CreativePipelineMCP.status(command, "success", "clip speed applied", {
        target: payload.target || {},
        speedPercent: operation.speedPercent,
        maintainPitch: operation.maintainPitch === true
      });
    }
    return CreativePipelineMCP.status(command, "accepted", "speed command recorded; clip speed API unavailable", {
      target: payload.target || {},
      speedPercent: operation.speedPercent,
      maintainPitch: operation.maintainPitch === true
    });
  } catch (err) {
    return CreativePipelineMCP.status(command, "error", "clip speed failed", { error: String(err), target: payload.target || {} });
  }
};

CreativePipelineMCP.resolveClip = function (payload) {
  if (!app.project || !app.project.activeSequence) {
    return null;
  }
  var target = payload.target || {};
  var sequence = app.project.activeSequence;
  var tracks = target.trackType === "audio" ? sequence.audioTracks : sequence.videoTracks;
  if (!tracks || tracks.numTracks <= (target.trackIndex || 0)) {
    return null;
  }
  var track = tracks[target.trackIndex || 0];
  var clips = track.clips || track;
  if (!clips || clips.numItems <= (target.clipIndex || 0)) {
    return null;
  }
  return clips[target.clipIndex || 0];
};

CreativePipelineMCP.setTimePropertySeconds = function (clip, property, seconds) {
  if (!clip || !clip[property]) {
    return false;
  }
  if (typeof clip[property].seconds === "number") {
    clip[property].seconds = seconds;
    return true;
  }
  if (typeof clip[property].setSecondsAsFraction === "function") {
    clip[property].setSecondsAsFraction(Math.round(seconds * 1000), 1000);
    return true;
  }
  return false;
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
    commandId: command.commandId || command.id || null,
    commandType: command.type || "unknown",
    status: status,
    message: message,
    details: details || {},
    finishedAt: CreativePipelineMCP.timestamp()
  });
};

CreativePipelineMCP.timestamp = function () {
  var now = new Date();
  if (now.toISOString) {
    return now.toISOString();
  }
  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }
  return now.getUTCFullYear() + "-"
    + pad(now.getUTCMonth() + 1) + "-"
    + pad(now.getUTCDate()) + "T"
    + pad(now.getUTCHours()) + ":"
    + pad(now.getUTCMinutes()) + ":"
    + pad(now.getUTCSeconds()) + "Z";
};
