const fs = require('fs');

const originalContent = fs.readFileSync('templates/partials/media-manager.html', 'utf-8');
const oldSVG = fs.readFileSync('new-svg.txt', 'utf-8').trim(); // Actually, I should just extract lines 7-9 and do a JS replace.

const targetContent = `    <clipPath id="mm-cookie-clip" clipPathUnits="objectBoundingBox">
      <path d="${oldSVG}" />
    </clipPath>`;

const fullSVG = fs.readFileSync('full-svg.txt', 'utf-8').trim();
const replacementContent = `    <clipPath id="mm-cookie-clip" clipPathUnits="objectBoundingBox">
      <path d="${fullSVG}" />
    </clipPath>`;

if (originalContent.includes(targetContent)) {
  const newContent = originalContent.replace(targetContent, replacementContent);
  fs.writeFileSync('templates/partials/media-manager.html', newContent);
  console.log("Success");
} else {
  console.log("Target not found!");
}
