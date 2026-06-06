(function () {
  var fs = require("fs");
  var path = require("path");
  var cs = new CSInterface();
  var log = document.getElementById("log");
  var queueDir = document.getElementById("queueDir");
  var commands = document.getElementById("commands");
  var statuses = document.getElementById("statuses");

  function append(message) {
    log.value += message + "\n";
    log.scrollTop = log.scrollHeight;
  }

  function pendingFiles(dir) {
    if (!dir || !fs.existsSync(dir)) {
      return [];
    }
    return fs.readdirSync(dir).filter(function (file) { return file.endsWith(".json"); });
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

  function runFile(file) {
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
      fs.renameSync(fullPath, path.join(dir, file + ".processed"));
      refreshQueue();
      refreshStatuses();
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
    pendingFiles(dir).forEach(runFile);
  });
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
