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
        append(file + ": " + result);
      });
    });
  });
})();

