const fs = require('fs');
const html = fs.readFileSync('C:\\Users\\Toilet67\\.gemini\\antigravity\\brain\\5da90d27-9910-44db-b89a-c8ce06dad1d3\\.system_generated\\steps\\151\\content.md', 'utf8');

const sourceMatch = html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|webm)[^"']*)["']/i) || html.match(/<source[^>]+src=["']([^"']+)["']/i);
const videoMatch = html.match(/<video[^>]+src=["']([^"']+\.(?:mp4|webm)[^"']*)["']/i) || html.match(/<video[^>]+src=["']([^"']+)["']/i);

console.log('Source match:', sourceMatch ? sourceMatch[1] : 'null');
console.log('Video match:', videoMatch ? videoMatch[1] : 'null');
