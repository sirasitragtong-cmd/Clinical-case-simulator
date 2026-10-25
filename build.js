'use strict';
const fs = require('node:fs');
const path = require('node:path');
function run() {
  const version = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  require('postcss').parse(fs.readFileSync(path.join(__dirname, 'css/game-hub.css'), 'utf8'));
  for (const name of ['index.html', 'sw.js']) {
    const file = path.join(__dirname, name);
    let source = fs.readFileSync(file, 'utf8').replace(/(\.(?:js|css|json))\?v=[A-Za-z0-9_.-]*/g, '$1?v=' + version);
    source = source.replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = 'pharmsim-${version}';`);
    fs.writeFileSync(file, source);
  }
  console.log('PharmVille build verified; asset version ' + version);
}
if (require.main === module) run();
module.exports = { run };
