const fs = require('fs');
const path = require('path');

console.log('*___________*');
console.log(process.env.GOOGLE_CONFIG);
console.log('*___________*');

fs.writeFile(path.resolve(__dirname, '../google-credentials-heroku.json'),
  process.env.GOOGLE_CONFIG, (err) => {
  console.log('Ah shoot.', err);
});
