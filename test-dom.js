const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
console.log("HTML has mm-mobile-ui:", html.includes('mm-mobile-ui'));
console.log("HTML has daybook-media-manager:", html.includes('daybook-media-manager'));
console.log("HTML has style='display: none;' inside mobile ui:", html.match(/class="mm-mobile-ui"[^>]*style="[^"]*display:\s*none/));
