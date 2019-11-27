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

// Keep reference to the latest `topic.`
// This mutates everytime user types in `/dejavu add [topic]`
let topic = ''

// for modal.open payloads, we do get a responseURL but for modal submissions we don't.
// to respond with a message in respons to form submission, we hold onto the responseURL here.
let cachedResponseUrl = null

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

function populateTagData(querySnapshot, arr) {
  querySnapshot.forEach(documentSnapshot => {
    const data = documentSnapshot.data()
    arr.push(data.tag)
  })
}


async function createInsightsCollectionForm(collectionTemplate, topic) {
  const form = Object.assign({}, collectionTemplate);
  const clientTags = []
  const industryTags = []

  const [clientTagsQuerySnapshot, industryTagsQuerySnapshot] = await Promise.all([getClientTags(), getIndustryTags()])

  populateTagData(clientTagsQuerySnapshot, clientTags)
  populateTagData(industryTagsQuerySnapshot, industryTags)

  form.blocks[4].element.options = clientTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))

  form.blocks[6].element.options = industryTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))

  form.blocks[0].elements[0].text = `Topic: ${topic}`
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

  form.blocks[1].element.options = themeTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))

  form.blocks[2].element.options = clientTags.map(tag => (
    {
      "text": {
        "type": "plain_text",
        "text": tag,
        "emoji": true
      },
      "value": tag
    }
  ))

  form.blocks[3].element.options = industryTags.map(tag => (
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
      response_url: responseUrl,
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
controller.webserver.post('/api/interactions', async (req, res, next) => {
  // Best practice to respond with empty 200
  res.status(200).end();

  const {
    body: { payload }
  } = req;
  
  const parsedPayload = JSON.parse(payload);
  console.log('payload --------> ', payload)
  const { type, response_url: responseUrl } = parsedPayload;

  if (responseUrl) {
    cachedResponseUrl = responseUrl;
  }
  
  // An action invoked by an interactive component
  if (type === ACTIONS.BLOCK_ACTIONS) {
    const { actions, trigger_id: triggerId } = parsedPayload;
    const [{ value }] = actions;
    
    if (value === 'load_previous_batch') {
      console.log('-----> load prev batch')
    } else if (value === 'load_next_batch') {
      console.log('-----> load next batch')

    } else if (value === 'true') {
      if (verb === 'add') {
        const view = await createInsightsCollectionForm(insightsCollectionTemplate, topic)
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
              sendMessageToSlackResponseURL(cachedResponseUrl, responseBody, process.env.botToken)
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
                  `Copy that. Searching for insights related to ${topic}. Hang tight ...`
              }
            }
          ]
        }

        // Push the response to Slack.
        sendMessageToSlackResponseURL(cachedResponseUrl, responseBody,process.env.botToken)
        
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
                cachedResponseUrl,
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
              text: `Gotcha. Feel free to call me again anytime like so: \`/dejavu [add, search] [topic or keyword]\``
            }
          }
        ]
      };

      // Push the response to Slack.
      sendMessageToSlackResponseURL(cachedResponseUrl, responseBody, process.env.botToken)
    }
  } else if (type === ACTIONS.VIEW_SUBMISSION) {
    // A Modal submission happened. Was it search or add?
    const viewTitle = parsedPayload.view.title.text.toLowerCase() 
    // add modal was submitted
    const submissionPayload = Object.values(parsedPayload.view.state.values);
    const submissionData = flatten(submissionPayload)

    if (viewTitle.includes('search')) {
      // search modal was submitted
      const industryTags = submissionData.industryTags ? submissionData.industryTags.map(({value}) => value) : []
      const clientTags = submissionData.clientTags ? submissionData.clientTags.map(({value}) => value) : []
      const themeTags = submissionData.themeTags ? submissionData.themeTags.map(({value}) => value) : []
      
      searchForKeyLearning({ industryTags, clientTags, themeTags })
        .then(({ results }) => {
          
          const responseBody = {
            blocks: [
              {
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": `Déjà vu found the following insights based on your search criteria:`
                }
              },
              {
                "type": "divider"
              }
            ]
          } 

          results.forEach(({ topic, createdBy, createdAt, keyLearning, guidingContext, client, relatedThemes, clientTags, industryTags}, index) => {
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
            

              responseBody.blocks.push(...resultItem)
            
          })

          responseBody.blocks.push({
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "action_id": "load_previous_batch",
                "text": {
                  "type": "plain_text",
                  "emoji": true,
                  "text": "Previous 5 Results"
                },
                "value": "load_previous_batch"
              },
              {
                "type": "button",
                "action_id": "load_next_batch",
                "text": {
                  "type": "plain_text",
                  "emoji": true,
                  "text": "Next 5 Results"
                },
                "value": "load_next_batch"
              }
            ]
          })
          
          console.log('\n Search Result: \n', JSON.stringify(responseBody))

          // Push the response to Slack.
          sendMessageToSlackResponseURL(cachedResponseUrl, responseBody, process.env.botToken)
      

        })
        .catch(e => {
          console.log('Failed at search: ', e)
        })

    }

    if (viewTitle.includes('add'))  {
      
      const responseBody = {
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Great! You research insight on ${topic} is now saved.`
            }
          }
        ]
      }
        
      // Push the response to Slack.
      sendMessageToSlackResponseURL(
        cachedResponseUrl,
        responseBody,
        process.env.botToken
      ).then(() => {
        
        const predefinedIndustryTags = submissionData.industryTags ? submissionData.industryTags.map(({value}) => value) : []
        const predefinedClientTags = submissionData.clientTags ? submissionData.clientTags.map(({value}) => value) : []
  
        const newIndustryTags = submissionData.otherIndustryTags ? submissionData.otherIndustryTags.split(',') : []
        const newClientTags = submissionData.otherClientTags ? submissionData.otherClientTags.split(',') : []
  
        const clientTags = [...predefinedClientTags, ...newClientTags]
        const industryTags = [...predefinedIndustryTags, ...newIndustryTags]
        
        const relatedThemes = (submissionData.relatedThemes && submissionData.relatedThemes.length > 0) ? submissionData.relatedThemes.split(',') : []

        const insightPayload = {
          keyLearning: submissionData.keyLearning,
          guidingContext: submissionData.context,
          clientTags: clientTags.map(sanitize),
          industryTags: industryTags.map(sanitize),
          relatedThemes: relatedThemes.map(sanitize),
          client: submissionData.client,
          createdBy: cachedUserName || '',
          topic
        }
        
        topic = '' // reset the topic
        
        const dbCalls = [
          addKeyLearning.bind(null, insightPayload),
          ...newIndustryTags.map(tag => addTag.bind(null, {tag}, 'industry')),
          ...newClientTags.map(tag => addTag.bind(null, {tag}, 'client')),
          ...newClientTags.map(tag => addTag.bind(null, {tag}, 'theme'))
        ]
        
        const dbCallPromises = dbCalls.map(dbCall => dbCall())
        
        return Promise.all(dbCallPromises)
          .then((res) => {
            console.log('Successfully performed one or more DB writes ', res)
          }).catch(e => {
            console.log('Failed  to perform one  or more DB writes: ', e)
          })
      
      }).catch((e) => {
        console.log('Failed', e)
  
        topic = '' // reset the topic
      });
    }


    /*
    console.log(
      '\n -->We got a submission!',
      JSON.stringify(submissionData),
      '---> topic is: ',
      topic,
      '\n'
    );
    */

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
