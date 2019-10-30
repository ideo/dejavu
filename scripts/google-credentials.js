const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const { google_client_id, google_project_id, google_client_secret } = process.env;

console.log('______________________');
console.log(process.env);
console.log('______________________');

const template = readFileSync(path.join(__dirname, '../credentials.example.json')).toString();

const output = JSON.parse(template);

output.installed[client_id] = google_client_id;
output.installed[project_id] = google_project_id;
output.installed[client_secret] = google_client_secret;

module.exports = function initGoogleCredentials() {
  console.log('________________________ HI MA!');
  
  console.log('google_client_id ', google_client_id);
  console.log('google_project_id ', google_project_id);
  console.log('google_client_secret ', google_client_secret);
  
  console.log(output);
  writeFileSync(path.join(__dirname, '../credentials.json'), JSON.stringify(output));
}
