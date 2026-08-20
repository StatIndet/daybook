const fs = require('fs');
let code = fs.readFileSync('internal/markdown/embeds.go', 'utf-8');

const regexImage = /func renderImageEmbed\(attrs map\[string\]string\) \(string, bool\) \{[\s\S]*?\n\}\n/g;
const regexVideo = /func renderVideoEmbed\(attrs map\[string\]string\) \(string, bool\) \{[\s\S]*?\n\}\n/g;
const regexAudio = /func renderAudioEmbed\(attrs map\[string\]string\) \(string, bool\) \{[\s\S]*?\n\}\n/g;
const regexPDF = /func renderPDFEmbed\(attrs map\[string\]string\) \(string, bool\) \{[\s\S]*?\n\}\n/g;

// Wait, since my previous patch prepended the new MediaEmbed struct, there might be TWO `renderImageEmbed` functions?
// Let's check how many times `func renderImageEmbed` appears.
