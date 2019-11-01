const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const privatekey = require("./google-credentials-heroku.json");
// const { JWT } = require("google-auth-library");
const path = require("path");


// temp. this should come from Slack App.
let topic = "amex";

function createDocNameForTopic(_topic) {
  return `Dejavu Insights - ${_topic}`;
}

// If modifying these scopes, delete token.json.
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/cloud-platform"
];

// configure a JWT auth client
// const jwtClient = new google.auth.JWT(
//   privatekey.client_email,
//   null,
//   privatekey.private_key,
//   SCOPES);
//authenticate request
// jwtClient.authorize(function (err, tokens) {
//   if (err) {
//     console.log('* ____ authorize ERROR _____ *', err);
//     return;
//   } else {
//     console.log('* ____ authorize SUCCESS _____ *');
//   }
// });


async function runSample() {
  // Create a new JWT client using the key file downloaded from the Google Developer Console
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, './google-credentials-heroku.json'),
    scopes: SCOPES,
  });
  const client = await auth.getClient();

  // Obtain a new drive client, making sure you pass along the auth client
  const drive = google.drive({
    version: 'v3',
    auth: client,
  });
  const docs = google.docs({
    version: "v1",
    auth
  });


  const query = `mimeType = 'application/vnd.google-apps.document'`;

  // Make an authorized request to list Drive files.
  const res = await drive.files.list({
    q: query,
    pageSize: 10,
    fields:
      "nextPageToken, files(id, name, lastModifyingUser, webViewLink, modifiedTime)"
  });

  let output = "Empty";

  // if we found qualifying files
  if (res.data.files && res.data.files.length) {
    output = '';
    const files = res.data.files;
    files.forEach(async (file) => {
      const doc = await docs.documents.get({ documentId: file.id });
      // console.log('____________________________ doc ____________________________');
      // console.log(doc);
      doc.data.body.content.forEach(block => {
        if (block.paragraph && block.paragraph.elements) {
          // console.log('_________ block.paragraph.elements');
          block.paragraph.elements.forEach(element => {
            // console.log(JSON.stringify(element));
            console.log('_______ typeof element.textRun.content === "string"', (!!typeof element.textRun.content) === "string", typeof element.textRun.content);
            console.log('_______ Includes:', !!element.textRun.content,toLowerCase().includes(topic.toLowerCase()), 'topic is: ', topic);
            
            if (element.textRun && element.textRun.content && typeof element.textRun.content === "string" && element.textRun.content.includes(topic)) {
              console.log('================= Found a match! =================')
              output = output.concat("\n");
              output = output.concat(element.textRun.content);
            }
          });
        }
      });
    });
  }

  return output;
}   


runSample()
  .then((res) => {
    console.log('_________ run sample success __________')
    console.log(res)
  })
  .catch(e => {
    console.log('_________ run sample failed __________')
    console.log(e)
  })


/**
 * Search in IDEO G-Drive for a given topic
 * @param {string} topic The topic to search for.
 */

async function search(topic) {
  const drive = google.drive({ version: "v3", jwtClient });
  const query = `mimeType = 'application/vnd.google-apps.document' and name contains '${topic}'`;
  const results = await drive.files.list({
    q: query,
    pageSize: 10,
    fields: "nextPageToken, files(id, name, lastModifyingUser, webViewLink, modifiedTime)"
  })
  return results;
}

async function _search(auth = jwtClient, topic) {
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });
  const query = `mimeType = 'application/vnd.google-apps.document' and name contains '${topic}'`;

  const results = await drive.files.list(
    {
      q: query,
      pageSize: 10,
      fields:
        "nextPageToken, files(id, name, lastModifyingUser, webViewLink, modifiedTime)"
    },
    (err, res) => {
      // Error Handling
      if (err) {
        return console.log(
          "#search: Searching for topic failed. The API returned an error: " +
            err
        );
      }

      // Matching files
      const files = res.data.files;

      if (files.length) {
        return files.map(file => {
          console.log(`#search: Found a match: ${file.name} (${file.id})`);
          return docs.documents.get(
            {
              documentId: file.id
            },
            (err, res) => {
              if (err) {
                return console.log(
                  "#search: Error while digging into a matchinc file: " + err
                );
              }
              let output = "";
              res.data.body.content.forEach(block => {
                if (block.paragraph && block.paragraph.elements) {
                  block.paragraph.elements.forEach(element => {
                    if (
                      element.textRun &&
                      element.textRun.content &&
                      typeof element.textRun.content === "string" &&
                      element.textRun.content.includes(topic)
                    ) {
                      output = output.concat("\n");
                      output = output.concat(element.textRun.content);
                    }
                  });
                }
              });

              // console.log(
              //   "#search found the following relevant paragraphs in relevant docs:\n"
              // );
              // console.log(output);
              // console.log("\n");
              return output;
            }
          );
        });

      }
    }
  );
  console.log('Results is: -------', results);
  return results;
}

/**
 * add an insight related to a topic in IDEO G-Drive
 * @param {string} topic The topic to add content for.
 * @param {string} content The research insight itself.
 */
function add(auth, topic, content) {
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });

  // Folder ID for Dejavu. This folder contains all research insights in IDEO Google Drive.
  let folderId = null;
  // 1. does the insight folder exist?
  drive.files.list(
    {
      q: `mimeType = 'application/vnd.google-apps.folder' and name = 'dejavu'`,
      fields: "files(id, name)"
    },
    (err, res) => {
      if (err) {
        // error handling
        return console.log(
          "#add: while looking for `dejavu` folder, the API returned an error: ",
          err
        );
      }

      if (res.data.files.length) {
        console.log("#add: dejavu folder exists: ", res.data.files[0].id);
        // folder exists. let's make a doc
        // keep the reference to the folder
        folderId = res.data.files[0].id;
      } else {
        // folder does not exist. let's make it
        const fileMetadata = {
          name: "dejavu",
          mimeType: "application/vnd.google-apps.folder"
        };
        drive.files.create(
          {
            resource: fileMetadata,
            fields: "id"
          },
          (err, file) => {
            if (err) {
              // Handle error
              console.error(
                "#add: error while trying to create `dejavu` folder: ",
                err
              );
            } else {
              console.log("#add: made `dejavu` Folder: ", file.data.id);
              // keep the reference to the folder
              folderId = file.data.id;
            }
          }
        );
      }

      drive.files.create(
        {
          resource: {
            name: `dejavu-insights-${topic}`,
            parents: [folderId]
          }
        },
        (err, file) => {
          if (err) {
            return console.log(
              "#add: failed to create the documnt ",
              `dejavu-insights-${topic} `,
              err
            );
          }
          console.log(
            "#add: successfully created insight document: ",
            `dejavu-insights-${topic}`,
            " and file id is: ",
            file.data.id
          );
        }
      );
    }
  );
}

/**
 * HOF that returns a function which will authorize
 * and perform the provided callback once authorized.
 * @param {function} APICall The callback to call with the authorized client.
 */
function authorizeAndMakeAPICall(APICall) {
  return function makeApiCall(argsArray) {
    // Load client secrets from a local file.
    fs.readFile("credentials.json", (err, content) => {
      if (err) return console.log("Error loading credentials.json:", err);
      // Authorize a client with credentials, then call the Google Drive API.
      authorize(JSON.parse(content), APICall, argsArray);
    });
  };
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback, callbackArgsArray) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client, ...callbackArgsArray);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question("Enter the code from that page here: ", code => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
        if (err) return console.error(err);
        console.log("Token stored to", TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

// module.exports = {
//   add: authorizeAndMakeAPICall(add),
//   search: authorizeAndMakeAPICall(search)
// };

module.exports = {
  add, search
}