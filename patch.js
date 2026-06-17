const fs = require('fs');
let js = fs.readFileSync('static/js/embeds.js', 'utf8');
const func = fs.readFileSync('scratch4.js', 'utf8');
const startMatch = "function setupNeteasePlayers() {";
const endMatch = "  window.daybookSyncEmbeds = function () {";
const startIndex = js.indexOf(startMatch);
const endIndex = js.indexOf(endMatch);
if (startIndex !== -1 && endIndex !== -1) {
  const newJs = js.substring(0, startIndex) + func.trim() + "\n\n" + js.substring(endIndex);
  fs.writeFileSync('static/js/embeds.js', newJs);
  console.log("Patched embeds.js successfully");
} else {
  console.error("Could not find boundaries", startIndex, endIndex);
}
