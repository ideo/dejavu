//  __   __  ___        ___
// |__) /  \  |  |__/ |  |  
// |__) \__/  |  |  \ |  |  

// This is the main file for the starter-slack bot.

// Import Botkit's core features
const { Botkit } = require('botkit');
const { BotkitCMSHelper } = require('botkit-plugin-cms');
const fetch = require('node-fetch');


// Import a platform-specific adapter for slack.

const { SlackAdapter, SlackMessageTypeMiddleware, SlackEventMiddleware } = require('botbuilder-adapter-slack');

const { MongoDbStorage } = require('botbuilder-storage-mongodb');

// Load process.env values from .env file
require('dotenv').config();

let storage = null;
if (process.env.MONGO_URI) {
    storage = new MongoDbStorage({
        url : process.env.MONGO_URI,
        database: 'dejavu',
        collection: 'messages'
    });
}

const adapter = new SlackAdapter({
    // REMOVE THIS OPTION AFTER YOU HAVE CONFIGURED YOUR APP!
    enable_incomplete: false,

    // parameters used to secure webhook endpoint
    verificationToken: process.env.verificationToken,
    clientSigningSecret: process.env.clientSigningSecret,  

    // auth token for a single-team app
    botToken: process.env.botToken,

    // credentials used to set up oauth for multi-team apps
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    scopes: ['bot', 'client'], 
    redirectUri: process.env.redirectUri,
 
    // functions required for retrieving team-specific info
    // for use in multi-team apps
    getTokenForTeam: getTokenForTeam,
    getBotUserByTeam: getBotUserByTeam,
});

// Use SlackEventMiddleware to emit events that match their original Slack event types.
adapter.use(new SlackEventMiddleware());

// Use SlackMessageType middleware to further classify messages as direct_message, direct_mention, or mention
adapter.use(new SlackMessageTypeMiddleware());

const controller = new Botkit({
  webhook_uri: '/api/messages',
  adapter: adapter,
  storage
});


if (process.env.cms_uri) {
    controller.usePlugin(new BotkitCMSHelper({
        cms_uri: process.env.cms_uri,
        token: process.env.cms_token,
    }));
}

// Once the bot has booted up its internal services, you can use them to do stuff.
controller.ready(() => {
    // load traditional developer-created local custom feature modules
    controller.loadModules(__dirname + '/features');

    /* catch-all that uses the CMS to trigger dialogs */
    if (controller.plugins.cms) {
        controller.on('message, direct_message', async (bot, message) => {
            let results = false;
            try {
              results = await controller.plugins.cms.testTrigger(bot, message);

            } catch(e) {
              console.log('YIKES. \n', e)
            }

            if (results !== false) {
                // do not continue middleware!
                return false;
            }
        });
    }

});

const KNOWN_VERBS = ['add', 'search'];
const MESSAGES = {
  UNKNOWN_VERB: `Woops, my bad. I can only understand the following tasks: ${KNOWN_VERBS.join(', ')}`
}

function sendMessageToSlackResponseURL(responseURL, JSONMessage, token) {
  return fetch(responseURL, {
    method: 'POST',
    body: JSON.stringify(JSONMessage),
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
  })
    .then(res => { 
      if (res.status === 200) { 
        return true  
      } else { 
        throw new Error('Slack command response posted to slack, but it came back with a non-200 response.') 
      }
    })
    .then(done => {console.log('Done!')})
    .catch(e => console.log('Woops!', e))
}

const confirmationButtonBlock = {
  'type': 'actions',
  'block_id': 'dejavu-intent-confirmation-buttons-block',
  'elements': [
    {
      'type': 'button',
      'value': 'true',
      'style': 'primary',
      'action_id': 'dejavu-intent-confirmation-buttons-true',
      'text': {
        'type': 'plain_text',
        'text': 'Yep!'
      },
      
    },
    {
      'type': 'button',
      'value': 'false',
      'style': 'danger',
      'action_id': 'dejavu-intent-confirmation-buttons-false',
      'text': {
        'type': 'plain_text',
        'text': 'Nope.'
      },
    }
  ]
};

const responseBodyTemplate = {
  'response_type': 'ephemeral',
  'blocks': [
    {
      'type': 'section',
      'text': {
        'type': 'plain_text',
        'text': '',
        'emoji': true
      }
    },
  ] 
};

const insightsCollectionTemplate = {
	"type": "modal",
	"title": {
		"type": "plain_text",
		"text": "Add Insight",
		"emoji": true
	},
	"submit": {
		"type": "plain_text",
		"text": "Save",
		"emoji": true
	},
	"close": {
		"type": "plain_text",
		"text": "Cancel",
		"emoji": true
	},
	"blocks": [
		{
			"type": "input",
			"element": {
				"type": "plain_text_input",
        "action_id": "insight",
				"multiline": true,
				"placeholder": {
					"type": "plain_text",
					"text": "What research insight would you like to share with your fellow IDEO-ers? Short and sweet insights are the best insights!"
				}
			},
			"label": {
				"type": "plain_text",
				"text": "Research Insight",
				"emoji": true
			}
		},
		{
			"type": "input",
			"element": {
				"type": "plain_text_input",
        "action_id": "context",
				"multiline": true,
				"placeholder": {
					"type": "plain_text",
					"text": "Insights are born out of one or more line(s) of inquiry. For a research insight to be most useful in the, it is best to capture the context as well."
				}
			},
			"label": {
				"type": "plain_text",
				"text": "Guiding Question(s)",
				"emoji": true
			}
		},
		{
			"type": "input",
			"element": {
				"type": "plain_text_input",
				"action_id": "tags",
				"placeholder": {
					"type": "plain_text",
					"text": "A comma separated list of tags related to this research insight."
				}
			},
			"label": {
				"type": "plain_text",
				"text": "Tags"
			}
		},
    {
			"type": "input",
			"element": {
				"type": "plain_text_input",
				"action_id": "client",
				"placeholder": {
					"type": "plain_text",
					"text": "Who is the client on this project?"
				}
			},
			"label": {
				"type": "plain_text",
				"text": "Client"
			}
		}
	]
}

controller.webserver.post('/api/slash-commands', (req, res, next) => {
  // Collect datapoints of interest & create some consts.
  const { body: { 
    text: commandText, 
    user_name: userName, 
    response_url: responseUrl,
    trigger_id: triggerID,
    token 
  }} = req
  
  // Immediately respond to Slack
  if (process.env.verificationToken !== token) {
    // Unauthorozied
    res.status(403).end('Access Forbidden');
  } else {
    // Best practice to respond with empty 200
    res.status(200).end();
  }
  
  // Show me what you got!
  console.log(
    '\nText: ', commandText, 
    '\nUser Name: ', userName, 
    '\nResponse URL: ', responseUrl, 
    '\nTrigger ID: ', triggerID
  );
  
  // Create a responseBody object from the template
  const responseBody = {...responseBodyTemplate};
  
  const verb = commandText.split(' ').shift();
  
  // Decide what the appropriate response should be
  if (!KNOWN_VERBS.includes(verb)) {
    // We don't know what the user meant. So we give them some minimal guidance.
    responseBody.blocks[0].text.text = MESSAGES.UNKNOWN_VERB;
  } else {
    // We know whatt the user meant. So we continue with the interaction flow.
    const [, ...rest] = commandText.split(' ')
    responseBody.blocks[0].text.text = `
      Great! From what I understand you want to ${verb === 'add' ? 'add to' : 'search for'} insights related to ${rest.join(' ')}. Is that correct?
    `;
    responseBody.blocks.push(confirmationButtonBlock);
  }
  
  // Push the response to Slack.
  sendMessageToSlackResponseURL(responseUrl, responseBody, token);
  return next();
});

controller.webserver.post('/api/interactions', (req, res, next) => {
  // Best practice to respond with empty 200
  res.status(200).end();
  
  const { body: { payload }} = req;
  const parsedPayload = JSON.parse(payload);
  const { type } = parsedPayload;
  
  if (type === 'block_actions') {
    // An action invoked by an interactive component
    const { 
      actions, 
      trigger_id: triggerId,
    } = parsedPayload;
    const [{value}] = actions;
    if (value === 'true') {
      // User clicked on 'Yep' button
      fetch('https://slack.com/api/views.open', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.botToken}`
        },
        body: JSON.stringify({
          trigger_id: triggerId,
          view: JSON.stringify(insightsCollectionTemplate)
        }),
      }).then(res => res.json())
        .then(parsedResponse => {
          console.log(parsedResponse)
          if (parsedResponse.ok) {

          } else {
            throw new Error(parsedResponse.error);
          }
        })
        .catch(e => console.log('Woops. ', e));
    } else if (value === 'false') {
      // User clicked on 'Nope' button
      console.log('NOPE.')
    }
  } else if (type === 'view_submission') {
    // A Modal submission happened 
    const data = Object.values(parsedPayload.view.state.values)
    console.log('\n -->We got a submission!', Object.values(parsedPayload.view.state.values), '\n');
    
  }
  
  

  return next();
})



controller.webserver.get('/', (req, res) => {
    res.send(`This app is running Botkit ${ controller.version }.`);
});

controller.webserver.get('/install', (req, res) => {
    // getInstallLink points to slack's oauth endpoint and includes clientId and scopes
    res.redirect(controller.adapter.getInstallLink());
});

controller.webserver.get('/install/auth', async (req, res) => {
    try {
        const results = await controller.adapter.validateOauthCode(req.query.code);

        console.log('FULL OAUTH DETAILS', results);

        // Store token by team in bot state.
        tokenCache[results.team_id] = results.bot.bot_access_token;

        // Capture team to bot id
        userCache[results.team_id] =  results.bot.bot_user_id;

        res.json('Success! Bot installed.');

    } catch (err) {
        console.error('OAUTH ERROR:', err);
        res.status(401);
        res.send(err.message);
    }
});

let tokenCache = {};
let userCache = {};

if (process.env.TOKENS) {
    tokenCache = JSON.parse(process.env.TOKENS);
} 

if (process.env.USERS) {
    userCache = JSON.parse(process.env.USERS);
} 

async function getTokenForTeam(teamId) {
    if (tokenCache[teamId]) {
        return new Promise((resolve) => {
            setTimeout(function() {
                resolve(tokenCache[teamId]);
            }, 150);
        });
    } else {
        console.error('Team not found in tokenCache: ', teamId);
    }
}

async function getBotUserByTeam(teamId) {
    if (userCache[teamId]) {
        return new Promise((resolve) => {
            setTimeout(function() {
                resolve(userCache[teamId]);
            }, 150);
        });
    } else {
        console.error('Team not found in userCache: ', teamId);
    }
}
