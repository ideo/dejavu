const fs = require('fs');
const path = require('path');

console.log('*___________*');
console.log(process.env.GOOGLE_CONFIG);
console.log('*___________*');

try {
  fs.writeFileSync(path.join(__dirname, '../google-credentials-heroku.json'), process.env.GOOGLE_CONFIG);
} catch(e) {
  console.log('________ error while writing google config to file', e);
}
