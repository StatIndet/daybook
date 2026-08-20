const fs = require('fs');
let code = fs.readFileSync('internal/markdown/embeds.go', 'utf-8');

const regexImage = /func renderImageEmbed\(attrs map\[string\]string\) \(string, bool\) \{[\s\S]*?\n\}\n/;
const regexVideo = /func renderVideoEmbed\(attrs map\[string\]string\) \(string, bool\) \{[\s\S]*?\n\}\n/;
const regexAudio = /func renderAudioEmbed\(attrs map\[string\]string\) \(string, bool\) \{[\s\S]*?\n\}\n/;
const regexPDF = /func renderPDFEmbed\(attrs map\[string\]string\) \(string, bool\) \{[\s\S]*?\n\}\n/;

// I already added MediaEmbed struct and RenderMediaEmbed function in the previous patch to this file! Let's check if it exists!
