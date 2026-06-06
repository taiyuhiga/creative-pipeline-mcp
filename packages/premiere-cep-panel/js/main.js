(function () {
  var fs = require("fs");
  var path = require("path");
  var cs = new CSInterface();
  var log = document.getElementById("log");
  var queueDir = document.getElementById("queueDir");

  function append(message) {
    log.value += message + "\n";
    log.scrollTop = log.scrollHeight;
  }

  document.getElementById("poll").addEventListener("click", function () {
    var dir = queueDir.value;
    if (!dir || !fs.existsSync(dir)) {
      append("Queue directory not found.");
      return;
    }
    var files = fs.readdirSync(dir).filter(function (file) { return file.endsWith(".json"); });
    files.forEach(function (file) {
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
      });
    });
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
