(function () {
  function nodeRequire(moduleName) {
    if (typeof require === "function") {
      return require(moduleName);
    }
    if (window.cep_node && typeof window.cep_node.require === "function") {
      return window.cep_node.require(moduleName);
    }
    return null;
  }

  var fs = nodeRequire("fs");
  var path = nodeRequire("path");
  var cs = typeof CSInterface !== "undefined"
    ? new CSInterface()
    : {
      evalScript: function (script, callback) {
        window.__adobe_cep__.evalScript(script, callback);
      },
      getSystemPath: function (pathType) {
        return window.__adobe_cep__.getSystemPath(pathType);
      }
    };
  var log = document.getElementById("log");
  var queueDir = document.getElementById("queueDir");
  var commands = document.getElementById("commands");
  var statuses = document.getElementById("statuses");

  function append(message) {
    log.value += message + "\n";
    log.scrollTop = log.scrollHeight;
  }

  if (!fs || !path) {
    append("Node file APIs are unavailable in this CEP host. Check manifest --enable-nodejs and --mixed-context.");
    return;
  }

  function systemPathToLocalPath(value) {
    var text = String(value || "");
    if (text.indexOf("file://") === 0) {
      return decodeURIComponent(text.replace(/^file:\/+/, "/"));
    }
    return text;
  }

  function defaultQueueDir() {
    var configPath = "";
    try {
      configPath = path.join(systemPathToLocalPath(cs.getSystemPath("extension")), "premiere-cep.json");
    } catch (error) {
      append("Could not resolve extension config path: " + error);
      return "";
    }
    try {
      if (!fs.existsSync(configPath)) {
        return "";
      }
      var config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.queueDir) {
        append("Loaded CEP config: " + configPath);
        return config.queueDir;
      }
    } catch (error) {
      append("Could not read CEP config " + configPath + ": " + error);
    }
    return "";
  }

  function pendingFiles(dir) {
    if (!dir || !fs.existsSync(dir)) {
      return [];
    }
    return fs.readdirSync(dir)
      .filter(function (file) { return file.endsWith(".json"); })
      .sort(function (left, right) {
        var leftPriority = commandPriority(path.join(dir, left));
        var rightPriority = commandPriority(path.join(dir, right));
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
        return left < right ? -1 : left > right ? 1 : 0;
      });
  }

  function commandPriority(fullPath) {
    try {
      var command = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      if (command.type === "build_timeline_from_otio" || command.type === "create_sequence") {
        return 0;
      }
      if (command.type === "import_media_once") {
        return 1;
      }
      if (command.type === "insert_clip_at_time" || command.type === "overwrite_clip_at_time") {
        return 2;
      }
      if (command.type === "trim_clip" || command.type === "split_clip" || command.type === "move_clip" || command.type === "set_clip_speed") {
        return 3;
      }
      if (command.type === "replace_clip_media" || command.type === "ripple_delete_with_approval") {
        return 4;
      }
      if (command.type === "add_marker") {
        return 5;
      }
      if (command.type === "apply_timeline_markers") {
        return 6;
      }
      if (command.type === "apply_brand_package") {
        return 7;
      }
      if (command.type === "export_sequence" || command.type === "export_with_preset") {
        return 8;
      }
    } catch (ignored) {}
    return 99;
  }

  function statusFiles(dir) {
    var statusDir = path.join(path.dirname(dir), "cep_status");
    if (!fs.existsSync(statusDir)) {
      return [];
    }
    return fs.readdirSync(statusDir).filter(function (file) { return file.endsWith(".json"); });
  }

  function refreshQueue() {
    var dir = queueDir.value;
    if (!dir || !fs.existsSync(dir)) {
      append("Queue directory not found.");
      return;
    }
    commands.innerHTML = "";
    pendingFiles(dir).forEach(function (file) {
      var option = document.createElement("option");
      option.value = file;
      option.textContent = file;
      commands.appendChild(option);
    });
    append("Pending commands: " + commands.options.length);
  }

  function refreshStatuses() {
    var dir = queueDir.value;
    statuses.innerHTML = "";
    statusFiles(dir).forEach(function (file) {
      var option = document.createElement("option");
      option.value = file;
      option.textContent = file;
      statuses.appendChild(option);
    });
    append("Status records: " + statuses.options.length);
  }

  function runFile(file, done) {
    var dir = queueDir.value;
    var fullPath = path.join(dir, file);
    var command = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    cs.evalScript("CreativePipelineMCP.dispatch(" + JSON.stringify(JSON.stringify(command)) + ")", function (result) {
      var status = CreativePipelineMCPPanel.parseStatus(result);
      append(file + ": " + status.status + " - " + status.message);
      var statusDir = path.join(path.dirname(dir), "cep_status");
      if (!fs.existsSync(statusDir)) {
        fs.mkdirSync(statusDir, { recursive: true });
      }
      status.command = command;
      status.processedAt = new Date().toISOString();
      fs.writeFileSync(path.join(statusDir, file), JSON.stringify(status, null, 2));
      if (status.commandType !== "unknown" || status.commandId) {
        fs.renameSync(fullPath, path.join(dir, file + ".processed"));
      } else {
        append(file + ": left in queue because CEP returned an unreadable status.");
      }
      refreshQueue();
      refreshStatuses();
      if (done) {
        done(status);
      }
    });
  }

  function runFilesSequentially(files, index) {
    if (index >= files.length) {
      append("Run all complete.");
      return;
    }
    runFile(files[index], function () {
      runFilesSequentially(files, index + 1);
    });
  }

  document.getElementById("refresh").addEventListener("click", refreshQueue);
  document.getElementById("refreshStatus").addEventListener("click", refreshStatuses);
  document.getElementById("runSelected").addEventListener("click", function () {
    if (!commands.value) {
      append("No command selected.");
      return;
    }
    runFile(commands.value);
  });
  document.getElementById("poll").addEventListener("click", function () {
    var dir = queueDir.value;
    runFilesSequentially(pendingFiles(dir), 0);
  });

  var configuredQueueDir = defaultQueueDir();
  if (configuredQueueDir) {
    queueDir.value = configuredQueueDir;
    refreshQueue();
    refreshStatuses();
  }
})();

var CreativePipelineMCPPanel = {
  parseStatus: function (result) {
    try {
      return JSON.parse(result);
    } catch (error) {
      return {
        schema: "creative.pipeline.premiere.status.v1",
        commandType: "unknown",
        status: "error",
        message: String(result),
        details: { parseError: String(error) }
      };
    }
  }
};
