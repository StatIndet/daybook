const fs = require('fs');

const originalContent = fs.readFileSync('templates/partials/media-manager.html', 'utf-8');
const lines = originalContent.split('\n');

const fullSVG = fs.readFileSync('full-svg.txt', 'utf-8').trim();
lines[7] = `      <path d="${fullSVG}" />`;

fs.writeFileSync('templates/partials/media-manager.html', lines.join('\n'));
console.log("Success");
