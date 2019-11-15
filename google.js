const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const privatekey = require("./google-credentials-heroku.json");
const { JWT } = require("google-auth-library");
const path = require("path");


// temp. this should come from Slack App.
// let topic = "Amex";

function createDocNameForTopic(_topic) {
  return `Dejavu Insights - ${_topic}`;
}

// If modifying these scopes, delete token.json.
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.appdata",
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


async function search(topic) {
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


  return new Promise((resolveTop, rejectTop) => {
    let textContents = [];

    // if we found qualifying files
    if (res.data.files && res.data.files.length) {
      const files = res.data.files;

      const filesPromises = files.map(async (file) => {
        const doc = await docs.documents.get({ documentId: file.id });
        // console.log('____________________________ doc ____________________________');
        // console.log(doc);
        const thisFileResults = [];
        doc.data.body.content.forEach(block => {

          if (block.paragraph && block.paragraph.elements) {
            // console.log('_________ block.paragraph.elements');
            block.paragraph.elements.forEach(element => {
              
              if (!!element.textRun && !!element.textRun.content && !!element.textRun.content.includes(topic)) {
                thisFileResults.push(element.textRun.content);
                //console.log(textContents.length);
                
              }
              
            });

          }
        
        });

        return new Promise((resolve, reject) => {
          resolve(thisFileResults);
        });

      });

      Promise.all(filesPromises).then((filesPromisesArr) => {
        textContents = [...filesPromisesArr[0]];
        console.log('__________ the length of the response is: ', textContents.length);
        resolveTop(textContents); 
      }).catch(e =>  console.log('promise all failed ', e));

    }
  });
  

}   

/**
 * add an insight related to a topic in IDEO G-Drive
 * @param {string} topic The topic to add content for.
 * @param {string} content The research insight itself.
 */
async function add(topic) {
  console.log('##### add is called');
  
  const key = fs.readFileSync('./google-credentials-heroku.json')

  const clientEmail = key['client_email']
  const privateKey = key['private_key']

  const client = new JWT(clientEmail, null, privatekey, SCOPES)
  
  // Create a new JWT client using the key file downloaded from the Google Developer Console
   
  //  const auth = new google.auth.GoogleAuth({
  //   keyFile: path.join(__dirname, './google-credentials-heroku.json'),
  //   scopes: SCOPES,
  // });
  
  // const client = await auth.getClient();

  // Obtain a new drive client, making sure you pass along the auth client
  const drive = google.drive({
    version: 'v3',
    auth: client,
  });
  const docs = google.docs({
    version: "v1",
    auth
  });

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
        console.log('--------- ', JSON.stringify(res))
        console.log("#add: dejavu folder exists: ", res.data.files[0].id);
        // folder exists. let's make a doc
        // keep the reference to the folder
        folderId = res.data.files[0].id;

        // check to see if we have a file with today's date
        const date = new Date();
        const fileName = `dejavu-${(date.getUTCMonth()+1)}/${date.getUTCDate()}/${date.getUTCFullYear()}`;

        drive.files.list({
          q: `mimeType = 'application/vnd.google-apps.document' and name = '${fileName}'`,
          fields: "files(id, name)"
        }, (err, res) => {
          if (err) return console.log('#add: failed to locate file ', fileName);
          if (res.data.files.length) {
            const fileId = res.data.files[0].id;
            const parentId = folderId;
            
            console.log('#add: found the file with name ', fileName, ' ', JSON.stringify(res.data.files), ' file id: ', fileId);
            // a dejavu file with today's date already exists!
            // let's get its current content from it
            drive.files.get({
              fileId,
              fields: '*'
            }, (err, res) => {
              if (err) return console.log('#add: failed to get the contents of the file ', fileId);
              console.log('#add: success in getting contents of the file ', JSON.stringify(res.data));

            })
          } else {
            // file does not exist
            drive.files.create({
              name: fileName,
              mimeType: `application/vnd.google-apps.document`,
              parents: [folderId]
            }, (err, res) => {
              if (err) return console.log('#add failed to create file ', fileName);
              console.log('#add successfully created the file', fileName, JSON.stringify(res));
            })
          }
        })


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

      return Promise.resolve(true);

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


module.exports = {
  add, search
}





/**
 * Search in IDEO G-Drive for a given topic
 * @param {string} topic The topic to search for.
 */

async function __search(topic) {
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
