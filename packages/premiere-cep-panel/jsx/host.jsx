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
  var sequenceName = payload.sequenceName || "Creative Pipeline Rough Cut";
  return "timeline request received for " + sequenceName + " from " + payload.otioPath;
};

