// Stremio Lite LG Development Server (runs exact tvserver.js backend)
const path = require('path');
const targetDir = path.join(__dirname, 'unpacked', 'usr', 'palm', 'services', 'io.strem.tv.beta.server');
process.chdir(targetDir);
require(path.join(targetDir, 'tvserver.js'));
