const fs = require('fs');
let code = fs.readFileSync('internal/obsidian/obsidian.go', 'utf-8');

// The original renderNoteEmbed function starts around line 746 and ends around line 798.
const regex = /func renderNoteEmbed\(target Target, heading string, href string, index Index, embedDepth int, visited map\[string\]bool\) \(string, bool\) \{[\s\S]*?\n\}\n/;
code = code.replace(regex, '');
// Wait, my previous replacement might have left a malformed function.
// Let's just find the first occurrence of func renderNoteEmbed... and delete until the end of the file or next func?
// Let's just use string operations to find the start and end.
