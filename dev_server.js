// Stremio Lite LG Development Server (runs exact tvserver.js backend)
const path = require('path');
process.chdir(path.join(__dirname, 'unpacked', 'usr', 'palm', 'services', 'io.strem.tv.beta.server'));
require('./unpacked/usr/palm/services/io.strem.tv.beta.server/tvserver.js');
