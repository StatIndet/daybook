const fs = require('fs');

const path = fs.readFileSync('new-svg.txt', 'utf-8').trim();
const tokens = path.split(' ');
let points = [];
let i = 0;
while (i < tokens.length) {
  if (tokens[i] === 'M' || tokens[i] === 'L') {
    points.push({ x: parseFloat(tokens[i+1]), y: parseFloat(tokens[i+2]) });
    i += 3;
  } else if (tokens[i] === 'Z') {
    i++;
  } else {
    i++;
  }
}

// Find index of (1.0000, 0.5000)
let q1End = -1;
for (let j = 0; j < points.length; j++) {
  if (points[j].x === 1 && points[j].y === 0.5) {
    q1End = j;
    break;
  }
}

const q1 = points.slice(0, q1End + 1); // From (0.5, 0) to (1, 0.5)

let q4 = [];
// Traverse q1 backwards, except the last point which is (1, 0.5) mirrored to (0, 0.5) - we don't need to duplicate (0, 0.5)
// Actually, to make it perfectly continuous, let's just trace q1 backwards from the second-to-last point down to the first point.
for (let j = q1.length - 2; j >= 0; j--) {
  q4.push({
    x: 1.0 - q1[j].x,
    y: q1[j].y
  });
}

// The existing points array already has Q1, Q2, Q3 (up to 0, 0.5)
let fullPoints = [...points, ...q4];

let newPath = `M ${fullPoints[0].x.toFixed(4)} ${fullPoints[0].y.toFixed(4)}`;
for (let j = 1; j < fullPoints.length; j++) {
  newPath += ` L ${fullPoints[j].x.toFixed(4)} ${fullPoints[j].y.toFixed(4)}`;
}
newPath += ' Z';

fs.writeFileSync('full-svg.txt', newPath);
