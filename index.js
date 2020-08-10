// Botkit's core features
const { Botkit } = require('botkit');
// Fetch
const fetch = require('node-fetch');
// Import data for Slack blocks
const insightsCollectionTemplate = require('./add-form.json')
const insightsSearchTemplate = require('./search-form.json')

// Import a platform-specific adapter for slack.
const {
  SlackAdapter,
  SlackMessageTypeMiddleware,
  SlackEventMiddleware
} = require('botbuilder-adapter-slack')

// Import persistance layer
const { addKeyLearning, searchForKeyLearning, getClientTags, getIndustryTags, getThemeTags, addTag, sanitize } = require('./persistance')

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
  controller.loadModules(__dirname + '/features')
});

const KNOWN_VERBS = ['add', 'search'];
const ACTIONS = {
  BLOCK_ACTIONS: 'block_actions',
  VIEW_SUBMISSION: 'view_submission',
  VIEW_CLOSED: 'view_closed'
}

// keep these here because of pagination
let _theme = null
let _client = null
let _industry = null
let _cursor = 0
let _limit = 5
let _total = 0

// for modal.open payloads, we do get a responseURL but for modal submissions we don't.
// to respond with a message in respons to form submission, we hold onto the responseURL here.
// let responseUrl = null

function flatten(arr) {
  let obj = {}
  const keys = [
    'keyLearning',
    'context',
    'newClientTags',
    'newIndustryTags',
    'newRelatedThemeTags',
    'predefinedClientTags',
    'predefinedIndustryTags',
    'predefinedRelatedThemeTags',
    'createdBy',
    'createdAt'
  ]

  arr.forEach((element) => {
    keys.forEach(key => {
      if (key in element) {
        let value = element[key].value || element[key].selected_options || (element[key].selected_option && element[key].selected_option.value) || null
        obj[key] = value
      }
    })
  })

  return obj
}

function populateTagData(querySnapshot, arr) {
  querySnapshot.forEach(documentSnapshot => {
    const data = documentSnapshot.data()
    arr.push(data.tag)
  })
}


async function createInsightsCollectionForm(collectionTemplate) {
  const form = Object.assign({}, collectionTemplate);
  const clientTags = []
  const industryTags = []
  const themeTags = []

  const [clientTagsQuerySnapshot, industryTagsQuerySnapshot, themeTagsQuerySnapshot] = await Promise.all([getClientTags(), getIndustryTags(), getThemeTags()])

  populateTagData(clientTagsQuerySnapshot, clientTags)
  populateTagData(industryTagsQuerySnapshot, industryTags)
  populateTagData(themeTagsQuerySnapshot, themeTags)

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

  form.blocks[7].element.options = themeTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))

  return Promise.resolve(form)
}

async function createInsightsSearchForm(searchTemplate) {
  const form = Object.assign({}, searchTemplate);
  const industryTags = []
  const clientTags = []
  const themeTags = []
  const [industryTagsQuerySnapshot, clientTagsQuerySnapshot, themeTagsQuerySnapshot] = await Promise.all([getIndustryTags(), getClientTags(), getThemeTags()])


  populateTagData(industryTagsQuerySnapshot, industryTags)
  populateTagData(clientTagsQuerySnapshot, clientTags)
  populateTagData(themeTagsQuerySnapshot, themeTags)

  console.log('industryTags', industryTags)
  console.log('clientTags', clientTags)
  console.log('themeTags', themeTags)

  form.blocks[2].element.options = themeTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))

  form.blocks[1].element.options = clientTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))

  form.blocks[0].element.options = industryTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))

  return Promise.resolve(form)
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
      console.log('> Successfully sent message to Slack Response URL.')
    })
    .catch(e => {
      console.log('> Woops!', e)
    });
}

function performSearch({ industryTags, clientTags, themeTags, cursor, limit }) {
  searchForKeyLearning({ industryTags, clientTags, themeTags, cursor, limit })
    .then(({ results, total }) => {
      // console.log('-> results: ', results)
      _total = total
      
      let message = results.length > 0
        ? `✨💥 *Déjà vu found ${_total} insights based on your search criteria:* ✨💥`
        : `✨💥*Déjà could not find any reaults for this search, or you have reached the end of the results for this search.*✨💥`

      const responseBody = {
        blocks: [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": message
            }
          },
          {
            "type": "divider"
          }
        ]
      }

      results.forEach(({ createdBy, createdAt, keyLearning, guidingContext, client, relatedThemes, clientTags, industryTags }, index) => {
        const resultItem = [{
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `*Key Learning:*\n${keyLearning}`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Guiding Context:*\n${guidingContext}`
          }
        },
        {
          "type": "context",
          "elements": [
            {
              "type": "plain_text",
              "emoji": true,
              "text": `\n💼 Client: ${clientTags.join(', ')}\n\n🏷 Industry Tags: ${industryTags.join(', ')}\n\n📝 Related Themes: ${relatedThemes.join(',')}\n\n👩🏽‍Added By: ${createdBy}\n\n🗓 Recorded at: ${createdAt.toDate().toString()}`
            }
          ]
        },
        {
          "type": "divider"
        }]

        // console.log('--------> response body blocks \n', resultItem, '')
        responseBody.blocks.push(...resultItem)

      })

      
      const nextBatchAction = {
        "type": "button",
        "action_id": "load_next_batch",
        "text": {
          "type": "plain_text",
          "emoji": true,
          "text": "Next page"
        },
        "value": "load_next_batch"
      }

      const prevBatchAction = {
        "type": "button",
        "action_id": "load_previous_batch",
        "text": {
          "type": "plain_text",
          "emoji": true,
          "text": "Previous page"
        },
        "value": "load_previous_batch"
      }

      const actionsBlock = {
        "type": "actions",
        "elements": [
        ]
      }

      if (_cursor > 0) {
        actionsBlock.elements.push(prevBatchAction)
      }

      if (_cursor < _total) {
        actionsBlock.elements.push(nextBatchAction)
      }

      if (actionsBlock.elements.length > 0) {
        responseBody.blocks.push(actionsBlock)
      }




      // console.log('\n Search Result: \n', JSON.stringify(responseBody))

      // Push the response to Slack.
      sendMessageToSlackResponseURL(responseURL, responseBody, process.env.botToken)


    })
    .catch(e => {
      console.log('Failed at search: ', e)
    })

}

/* 
  A little hello.
*/
controller.webserver.get('/', (req, res, next) => {
  res.status(200).end('Hello from Deja Vu')
  return next();
});

/* 
  The following endpoint serves "inustry tags"
*/
controller.webserver.get('/client-tags/', async (req, res, next) => {
  const clientTags = await getClientTags()
  clientTags.forEach(doc => console.log(doc.data()))
  res.status(200).end('Hello from Deja Vu')

  return next();
});

// keeping these in the closure.
let verb = null
let cachedUserName = null

/* 
  The following endpoint processes every slash command  ala `/dejavu search amex`
*/
controller.webserver.post('/api/slash-commands', (req, res, next) => {
  // Collect datapoints of interest & create some consts.
  const {
    body: {
      text: commandText,
      user_name: userName,
      response_url: responseURL,
      trigger_id: triggerID,
      token
    }
  } = req;

  cachedUserName = userName

  // Immediately respond to Slack
  if (process.env.verificationToken !== token) {
    // Unauthorozied
    res.status(403).end('Access Forbidden');
  } else {
    // Best practice to respond with empty 200
    res.status(200).end();
  }

  // Log what we got!
  /*
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
  */
  // The verb entered by the user
  verb = commandText.split(' ').shift();

  // Decide what the appropriate response should be
  if (!KNOWN_VERBS.includes(verb)) {
    // Push the response to Slack.
    fetch(responseURL, {
      method: 'POST',
      body: JSON.stringify({
        'response_type': 'ephemeral',
        'blocks': [
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `Woops, my bad. I can only understand the following tasks: add, search like so: \n \`/dejavu add\` or \`/dejavu search\``
            }
          }
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
  } else {
    // We know what the user meant. So we continue with the interaction flow.
    // Push the response to Slack.
    fetch(responseURL, {
      method: 'POST',
      body: JSON.stringify({
        'response_type': 'ephemeral',
        'blocks': [
          {
            'type': 'section',
            'text': {
              'type': 'mrkdwn',
              'text': `Great! From what I understand you want to ${verb === 'add' ? 'save' : 'search for'} Key Learnings. Is that correct?`
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
            ]
          }
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
controller.webserver.post('/api/interactions', async (req, res, next) => {
  // Best practice to respond with empty 200
  res.status(200).end();
  
  const {
    body, body: { payload }
  } = req;
  
  const parsedPayload = JSON.parse(payload);
 

  // console.log('payload --------> ', payload)
  const { type, response_url: responseURL } = parsedPayload;

  console.log(`
  \n
  Response URL –
  \n
  ${responseURL}
  \n
  ${parsedPayload.trigger_id}
`)

  // An action invoked by an interactive component
  if (type === ACTIONS.BLOCK_ACTIONS) {
    const { actions, trigger_id: triggerId } = parsedPayload;
    const [{ value }] = actions;

    if (value === 'load_previous_batch') {
      // console.log('-----> load prev batch')
      _cursor = _cursor - _limit
      performSearch({ industryTags: _industry, clientTags: _client, themeTags: _theme, cursor: _cursor, limit: _limit })
    } else if (value === 'load_next_batch') {
      // console.log('-----> load next batch')
      _cursor = _cursor + _limit
      performSearch({ industryTags: _industry, clientTags: _client, themeTags: _theme, cursor: _cursor, limit: _limit })
    } else if (value === 'true') {
      if (verb === 'add') {
        const view = await createInsightsCollectionForm(insightsCollectionTemplate)
        // User clicked on 'Yep' button and they want to 'add' insight
        fetch('https://slack.com/api/views.open', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.botToken}`
          },
          body: JSON.stringify({
            trigger_id: triggerId,
            view: JSON.stringify(view)
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
              sendMessageToSlackResponseURL(responseURL, responseBody, process.env.botToken)
              throw new Error(parsedResponse.error);
            }
          })
          .catch(e => console.log('Woops. ', e));
      } else if (verb === 'search') {
        const view = await createInsightsSearchForm(insightsSearchTemplate)

        const responseBody = {
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'plain_text',
                text:
                  `Copy that. Opening the search modal now ...`
              }
            }
          ]
        }

        // Push the response to Slack.
        sendMessageToSlackResponseURL(responseURL, responseBody, process.env.botToken)

        // open search modal
        fetch('https://slack.com/api/views.open', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.botToken}`
          },
          body: JSON.stringify({
            trigger_id: triggerId,
            view: JSON.stringify(view)
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
                responseURL,
                responseBody,
                process.env.botToken
              );
              throw new Error(parsedResponse.error);
            }
          })
          .catch(e => console.log('Woops. ', e));
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
              text: `Gotcha. Feel free to call me again anytime like so: \`/dejavu add\` or \`/dejavu search\``
            }
          }
        ]
      };

      // Push the response to Slack.
      sendMessageToSlackResponseURL(responseURL, responseBody, process.env.botToken)
    }
  } else if (type === ACTIONS.VIEW_SUBMISSION) {
    // A Modal submission happened. Was it search or add?
    const viewTitle = parsedPayload.view.title.text.toLowerCase()
    const submissionPayload = Object.values(parsedPayload.view.state.values);
    const submissionData = flatten(submissionPayload)
    if (viewTitle.includes('search')) {
      
      console.log('----------\n', JSON.stringify(parsedPayload), '\n----------------')

      // search modal was submitted
      const themeTags = submissionData.predefinedRelatedThemeTags ? submissionData.predefinedRelatedThemeTags.map(({ value }) => value) : []
      const industryTags = submissionData.predefinedIndustryTags ? [submissionData.predefinedIndustryTags] : []
      const clientTags = submissionData.predefinedClientTags ? [submissionData.predefinedClientTags] : []
      
      _theme = themeTags
      _client = clientTags
      _industry = industryTags
      
      performSearch({ industryTags, clientTags, themeTags, cursor: _cursor, limit: _limit })
      
    }
    
    
    if (viewTitle.includes('add')) {
      // add modal was submitted

      const responseBody = {
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Great! Your Key Learning has been saved.`
            }
          }
        ]
      }

      // Push the response to Slack.
      sendMessageToSlackResponseURL(
        responseURL,
        responseBody,
        process.env.botToken
      ).then(() => {

        const predefinedClientTags = submissionData.predefinedClientTags ? submissionData.predefinedClientTags.map(({ value }) => value) : []
        const predefinedIndustryTags = submissionData.predefinedIndustryTags ? submissionData.predefinedIndustryTags.map(({ value }) => value) : []
        const predefinedRelatedThemeTags = submissionData.predefinedRelatedThemeTags ? submissionData.predefinedRelatedThemeTags.map(({ value }) => value) : []

        const newClientTags = submissionData.newClientTags ? submissionData.newClientTags.split(',') : []
        const newIndustryTags = submissionData.newIndustryTags ? submissionData.newIndustryTags.split(',') : []
        const newRelatedThemeTags = submissionData.newRelatedThemeTags ? submissionData.newRelatedThemeTags.split(',') : []

        const clientTags = [...predefinedClientTags, ...newClientTags]
        const industryTags = [...predefinedIndustryTags, ...newIndustryTags]
        const relatedThemeTags = [...predefinedRelatedThemeTags, ...newRelatedThemeTags]

        const insightPayload = {
          keyLearning: submissionData.keyLearning,
          guidingContext: submissionData.context,
          clientTags: clientTags.map(sanitize),
          industryTags: industryTags.map(sanitize),
          relatedThemes: relatedThemeTags.map(sanitize),
          createdBy: cachedUserName || ''
        }

        const dbCalls = [
          addKeyLearning.bind(null, insightPayload),
          ...newIndustryTags.map(tag => addTag.bind(null, { tag }, 'industry')),
          ...newClientTags.map(tag => addTag.bind(null, { tag }, 'client')),
          ...newRelatedThemeTags.map(tag => addTag.bind(null, { tag }, 'theme'))
        ]

        const dbCallPromises = dbCalls.map(dbCall => dbCall())

        return Promise.all(dbCallPromises)
          .then((res) => {
            console.log('Successfully performed one or more DB writes ', res)
          }).catch(e => {
            console.log('Failed to perform one or more DB writes: ', e)
          })

      }).catch((e) => {
        console.log('Failed', e)
      });
    }


  } else if (type === ACTIONS.VIEW_CLOSED) {

    console.log('Modal view closed')

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
      setTimeout(function () {
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
      setTimeout(function () {
        resolve(userCache[teamId]);
      }, 150);
    });
  } else {
    console.error('Team not found in userCache: ', teamId);
  }
}
