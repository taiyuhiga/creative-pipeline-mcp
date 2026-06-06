var CreativePipelineMCP = CreativePipelineMCP || {};

CreativePipelineMCP.dispatch = function (json) {
  var command = JSON.parse(json);
  if (!command || !command.type || !command.payload) {
    return "invalid command";
  }
  if (command.type === "build_timeline_from_otio") {
    return CreativePipelineMCP.buildTimelineFromOtio(command.payload);
  }
  if (command.type === "export_sequence" || command.type === "apply_brand_package") {
    return "command accepted but requires project-specific implementation: " + command.type;
  }
  return "unsupported command: " + command.type;
};

CreativePipelineMCP.buildTimelineFromOtio = function (payload) {
  if (!app.project) {
    return "no active project";
  }
  var otio = CreativePipelineMCP.readJsonFile(payload.otioPath);
  var mediaPaths = CreativePipelineMCP.collectMediaPaths(otio);
  if (!mediaPaths.length) {
    return "no media paths found in OTIO";
  }

  var sequenceName = payload.sequenceName || "Creative Pipeline Rough Cut";
  app.project.importFiles(mediaPaths, true, app.project.rootItem, false);

  var sequence = app.project.activeSequence;
  if (!sequence && app.project.createNewSequence) {
    try {
      app.project.createNewSequence(sequenceName, sequenceName);
      sequence = app.project.activeSequence;
    } catch (err) {
      return "imported " + mediaPaths.length + " media items; sequence creation failed: " + err;
    }
  }
  if (!sequence) {
    return "imported " + mediaPaths.length + " media items; no active sequence";
  }

  var inserted = 0;
  for (var i = 0; i < mediaPaths.length; i++) {
    var item = CreativePipelineMCP.findProjectItemByMediaPath(app.project.rootItem, mediaPaths[i]);
    if (item && sequence.videoTracks && sequence.videoTracks.numTracks > 0) {
      try {
        sequence.videoTracks[0].insertClip(item, inserted * 3);
        inserted++;
      } catch (insertErr) {
        return "imported " + mediaPaths.length + " media items; insert failed: " + insertErr;
      }
    }
  }

  return "imported " + mediaPaths.length + " media items; inserted " + inserted + " clips into " + sequenceName;
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

CreativePipelineMCP.collectMediaPaths = function (node) {
  var paths = [];
  function walk(value) {
    if (!value) {
      return;
    }
    if (value.target_url) {
      paths.push(value.target_url);
    }
    if (value.media_reference && value.media_reference.target_url) {
      paths.push(value.media_reference.target_url);
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
  return paths;
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
