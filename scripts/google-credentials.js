const { readFileSync, writeFileSync } = require('fs');
const { google_client_id, google_project_id, google_client_secret } = process.env;

const template = readFileSync('../credentials.example.json').toString();

const output = JSON.parse(template);

output.installed[client_id] = google_client_id;
output.installed[project_id] = google_project_id;
output.installed[client_secret] = google_client_secret;

writeFileSync('../credentials.json', JSON.stringify(output));

console.log('google_client_id ', google_client_id);
console.log('google_project_id ', google_project_id);
console.log('google_client_secret ', google_client_secret);

console.log(output);