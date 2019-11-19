const fs = require('fs');
const path = require('path');

try {
  fs.writeFileSync(path.join(__dirname, '../google-credentials-heroku.json'), process.env.GOOGLE_CONFIG);
} catch(e) {
  console.log('Error while writing google config to file', e);
}
