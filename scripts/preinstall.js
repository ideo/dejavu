const fs = require('fs');
const path = require('path');

console.log('*___________*');
// console.log(process.env.GOOGLE_CONFIG);
console.log('*___________*');

try {
  fs.writeFileSync(path.join(__dirname, '../google-credentials-heroku.json'), process.env.GOOGLE_CONFIG);
  console.log('________ success while writing google config to file\n');
  const file = require(path.join(__dirname, '../google-credentials-heroku.json'))
  console.log(file)
} catch(e) {
  console.log('________ error while writing google config to file', e);
}
