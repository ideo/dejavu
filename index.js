// Botkit's core features
const { Botkit } = require('botkit');
// Fetch
const fetch = require('node-fetch');
// Import data for Slack blocks
const insightsCollectionTemplate = require('./data.json') 

// Import a platform-specific adapter for slack.
const {
  SlackAdapter,
  SlackMessageTypeMiddleware,
  SlackEventMiddleware
} = require('botbuilder-adapter-slack')

// Import persistance layer
const { addKeyLearning, getClientTags, getIndustryTags, addTag } = require('./persistance')

// let clientTags = []
// let industryTags = []



const adapter = new SlackAdapter({
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
  getBotUserByTeam: getBotUserByTeam
})

// Use SlackEventMiddleware to emit events that match their original Slack event types
adapter.use(new SlackEventMiddleware())

// Use SlackMessageType middleware to further classify messages as direct_message, direct_mention, or mention
adapter.use(new SlackMessageTypeMiddleware());

const controller = new Botkit({ webhook_uri: '/api/messages', adapter })

// Once the bot has booted up its internal services, you can use them to do stuff.
controller.ready(() => {
  // load traditional developer-created local custom feature modules
  controller.loadModules(__dirname + '/features');
});

const KNOWN_VERBS = ['add', 'search'];
const ACTIONS = {
  BLOCK_ACTIONS: 'block_actions',
  VIEW_SUBMISSION: 'view_submission',
  VIEW_CLOSED: 'view_closed'
};

// Keep reference to the latest `topic.`
// This mutates everytime user types in `/dejavu add [topic]`
let topic = '';

// for modal.open payloads, we do get a responseURL but for modal submissions we don't.
// to respond with a message in respons to form submission, we hold onto the responseURL here.
let cachedResponseUrl = null;

function flatten(arr) {
  let obj = {}
  const keys = ['keyLearning', 'context', 'otherClientTags', 'otherIndustryTags', 'client', 'clientTags', 'industryTags', 'relatedThemes']
  arr.forEach((element) => {
    keys.forEach(key => {
      if (key in element) {
        let value = element[key].value || element[key].selected_options || null
        obj[key] = value
      }
    })
  })
  return obj
}

async function createInsightsCollectionForm(collectionTemplate, topic) {
  const form = Object.assign({}, collectionTemplate);
  const clientTags = []
  const industryTags = []

  const [clientTagsQuerySnapshot, industryTagsQuerySnapshot] = await Promise.all([getClientTags(), getIndustryTags()])

  clientTagsQuerySnapshot.forEach(documentSnapshot => {
    const data = documentSnapshot.data()
    clientTags.push(data.tag)
  })
  industryTagsQuerySnapshot.forEach(documentSnapshot => {
    const data = documentSnapshot.data()
    industryTags.push(data.tag)
  })

  form.blocks[3].element.options = clientTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))
  form.blocks[5].element.options = industryTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))
  console.log(JSON.stringify(form))
  form.blocks[0].elements[0].text = `Topic: ${topic}`;
  return form;
}

function sendMessageToSlackResponseURL(responseURL, JSONMessage, token) {
  return fetch(responseURL, {
    method: 'POST',
    body: JSON.stringify(JSONMessage),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  })
    .then(res => {
      if (res.status === 200) {
        return true;
      } else {
        throw new Error(
          '> Message sent to slack, but it came back with a non-200 response: ' +
            JSON.stringify(res)
        );
      }
    })
    .then(() => {
      console.log('> Successfully sent message to Slack Response URL.');
    })
    .catch(e => {
      console.log('> Woops!', e);
    });
}

/* 
  A little hello.
*/
controller.webserver.get('/', (req, res, next) => {
  res.status(200).end('Hello from Deja Vu');
  return next();
});

/* 
  The following endpoint serves "inustry tags"
*/
controller.webserver.get('/client-tags/', async (req, res, next) => {
  console.log(' ------> hit the endpoint: /api/client tags/')
  const clientTags = await getClientTags()
  clientTags.forEach(doc => console.log(doc.data()))
  console.log(' ------> hit the endpoint: client tags ')
  res.status(200).end('Hello from Deja Vu');

  return next();
});

// keeping this in the closure.
let verb = null;

/* 
  The following endpoint processes every slash command  ala `/dejavu search amex`
*/
controller.webserver.post('/api/slash-commands', (req, res, next) => {
  // Collect datapoints of interest & create some consts.
  const {
    body: {
      text: commandText,
      user_name: userName,
      response_url: responseUrl,
      trigger_id: triggerID,
      token
    }
  } = req;

  // Immediately respond to Slack
  if (process.env.verificationToken !== token) {
    // Unauthorozied
    res.status(403).end('Access Forbidden');
  } else {
    // Best practice to respond with empty 200
    res.status(200).end();
  }

  // Log what we got!
  console.log(
    '\nText: ',
    commandText,
    '\nUser Name: ',
    userName,
    '\nResponse URL: ',
    responseUrl,
    '\nTrigger ID: ',
    triggerID
  );

  // The verb entered by the user
  verb = commandText.split(' ').shift();

  // Decide what the appropriate response should be
  if (!KNOWN_VERBS.includes(verb)) {
    // Push the response to Slack.
    fetch(responseUrl, {
      method: 'POST',
      body: JSON.stringify({
        'response_type': 'ephemeral',
        'blocks': [
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `Woops, my bad. I can only understand the following tasks: add, search like so: \n \`/dejavu [add, search] [topic or keyword]\``
            }
          }
        ]}),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })
      .then(res => {
        if (res.status === 200) {
          return true;
        } else {
          throw new Error(
            '> Message sent to slack, but it came back with a non-200 response: ' +
              JSON.stringify(res)
          );
        }
      })
      .then(() => {
        console.log('> Successfully sent message to Slack Response URL.');
      })
      .catch(e => {
        console.log('> Woops!', e);
    });
  } else {
    // We know what the user meant. So we continue with the interaction flow.
    const [, ...rest] = commandText.split(' ');
    // The user has declared their topic of interest. Hold onto it.
    topic = rest.join(' ');
    // Push the response to Slack.
    fetch(responseUrl, {
      method: 'POST',
      body: JSON.stringify({
        'response_type': 'ephemeral',
        'blocks': [
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `Great! From what I understand you want to ${verb === 'add' ? 'add to' : 'search for'} insights related to ${rest.join(' ')}. Is that correct?`
            }
          }, {
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
              }
            },
            {
              'type': 'button',
              'value': 'false',
              'style': 'danger',
              'action_id': 'dejavu-intent-confirmation-buttons-false',
              'text': {
                'type': 'plain_text',
                'text': 'Nope.'
              }
            }
          ]}
        ] 
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    })
    .then(res => {
      if (res.status === 200) {
        return true;
      } else {
        throw new Error(
          '> Message sent to slack, but it came back with a non-200 response: ' +
            JSON.stringify(res)
        );
      }
    })
    .then(() => {
      console.log('> Successfully sent message to Slack Response URL.');
    })
    .catch(e => {
      console.log('> Woops!', e);
    });
  }

  return next();
});

/* 
  The following endpoing processes modal interactions
*/
controller.webserver.post('/api/interactions', (req, res, next) => {
  // Best practice to respond with empty 200
  res.status(200).end();

  const {
    body: { payload }
  } = req;
  const parsedPayload = JSON.parse(payload);
  const { type, response_url: responseUrl } = parsedPayload;

  if (responseUrl) {
    cachedResponseUrl = responseUrl;
  }

  // An action invoked by an interactive component
  if (type === ACTIONS.BLOCK_ACTIONS) {
    const { actions, trigger_id: triggerId } = parsedPayload;
    const [{ value }] = actions;
    if (value === 'true') {
      if (verb === 'add') {
        // User clicked on 'Yep' button and they want to 'add' insight
        fetch('https://slack.com/api/views.open', {
          method: 'POST',
          headers: {  
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.botToken}`
          },
          body: JSON.stringify({
            trigger_id: triggerId,
            view: createInsightsCollectionForm(insightsCollectionTemplate, topic)
          })
        }).then(res => res.json())
          .then(parsedResponse => {
            if (parsedResponse.ok) {
              console.log('> Dejavu: successfully opened modal');
            } else {
              const responseBody = {
                response_type: 'ephemeral',
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'plain_text',
                      text:
                        'Oops. Something is amiss. I have notified my developer to resolve this issue ASAP. Sorry about that!'
                    }
                  }
                ]
              };

              // Push the response to Slack.
              sendMessageToSlackResponseURL(
                cachedResponseUrl,
                responseBody,
                process.env.botToken
              );
              throw new Error(parsedResponse.error);
            }
          })
          .catch(e => console.log('Woops. ', e));
      } else if (verb === 'search') {
        const responseBody = {
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'plain_text',
                text:
                  `Copy that. Searching for insights related to ${topic}. Hang tight ...`
              }
            }
          ]
        };
        // Push the response to Slack.
        sendMessageToSlackResponseURL(
          cachedResponseUrl,
          responseBody,
          process.env.botToken
        );



        search(topic).then(res => {
          console.log('------------------> search came back: ', res)
          function getBlock(input) {
            return input.map(insight => (
              {
                type: 'section',
                text: {
                  type: 'plain_text',
                  text: insight
                }
              }
            ));
          }

          const insights = getBlock(res).length ? getBlock(res) : {
            type: 'section',
            text: {
              type: 'plain_text',
              text: `Woops, could not find any insight with this keyword. Try something else?`
            }
          }

          const responseBody = {
            response_type: 'ephemeral',
            blocks: insights
          };

          sendMessageToSlackResponseURL(
            cachedResponseUrl,
            responseBody,
            process.env.botToken
          );

        }).catch(err => {
          console.log('------------------> search failed: ', err)
        });
      }
      
    } else if (value === 'false') {
      // User clicked on 'Nope' button
      const responseBody = {
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Gotcha. Feel free to call me again anytime like so: \`/dejavu [add, search] [topic or keyword]\``
            }
          }
        ]
      };

      // Push the response to Slack.
      sendMessageToSlackResponseURL(
        cachedResponseUrl,
        responseBody,
        process.env.botToken
      );
    }
  } else if (type === ACTIONS.VIEW_SUBMISSION) {
    // A Modal submission happened
    const submissionPayload = Object.values(parsedPayload.view.state.values);
    const submissionData = flatten(submissionPayload)
    console.log(
      '\n -->We got a submission!',
      JSON.stringify(submissionData),
      '---> topic is: ',
      topic,
      '\n'
    );

    const responseBody = {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Great! You research insight on ${topic} is being saved. I'll give you a link shortly...`
          }
        }
      ]
    };

    console.log('Insight recorded response body: ', responseBody);
    // Push the response to Slack.
    sendMessageToSlackResponseURL(
      cachedResponseUrl,
      responseBody,
      process.env.botToken
    ).then((res) => {
      console.log('--> sendMessageToSlackResponseURL then', res);
      
      const insightPayload = {
        keyLearning: submissionData.keyLearning,
        guidingContext: submissionData.context,
        clientTags: submissionData.clientTags ? submissionData.clientTags.map(({value}) => value) : [],
        industryTags: submissionData.industryTags ? submissionData.industryTags.map(({value}) => value) : [],
        otherIndustryTags: submissionData.otherIndustryTags ? submissionData.otherIndustryTags.split(',') : [],
        otherClientTags: submissionData.otherClientTags ? submissionData.otherClientTags.split(',') : '',
        client: submissionData.client,
        relatedThemes: submissionData.relatedThemes,
        topic
      }

      topic = '' // reset the topic

      const dbCalls = [
        addKeyLearning.bind(null, insightPayload),
        ...insightPayload.otherIndustryTags.map(tag => addTag.bind(null, {tag}, 'industry')),
        ...insightPayload.otherClientTags.map(tag => addTag.bind(null, {tag}, 'client'))
      ]
      const dbCallPromises = dbCalls.map(dbCall => dbCall())

      return Promise.all(dbCallPromises)
        .then((res) => {
          console.log('Successfully performed one or more DB writes ', res)
        }).catch(e => {
          console.log('Failed  to perform one  or more DB writes: ', e)
        })
    
    }).catch((e) => {
      console.log('--> sendMessageToSlackResponseURL error', e);
      topic = '' // reset the topic
    });

  } else if (type === ACTIONS.VIEW_CLOSED) {
    console.log('View Closed');
  }

  return next();
});

controller.webserver.get('/', (req, res) => {
  res.send(`This app is running Botkit ${controller.version}.`);
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
    userCache[results.team_id] = results.bot.bot_user_id;

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
    return new Promise(resolve => {
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
    return new Promise(resolve => {
      setTimeout(function() {
        resolve(userCache[teamId]);
      }, 150);
    });
  } else {
    console.error('Team not found in userCache: ', teamId);
  }
}
