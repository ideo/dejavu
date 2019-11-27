const path = require('path')
const admin = require('firebase-admin');

let serviceAccount = require(path.join(__dirname, './google-credentials-heroku.json'))

admin.initializeApp({ credential: admin.credential.cert(serviceAccount)});

let db = admin.firestore()

function sanitize(inputString) {
  return inputString.trim().toLowerCase()
}

function addKeyLearning({
  createdBy = '',
  topic = '',
  keyLearning = '',
  client = '',
  guidingContext = '', 
  clientTags = [], 
  industryTags = [], 
  relatedThemes = [] }) {

  return db
    .collection('keyLearnings')
    .doc()
    .set({topic, keyLearning, guidingContext, topic, client, clientTags, industryTags, createdBy, relatedThemes, createdAt: new Date() })
}

function addTag({tag}, type) {
  const validTypes = ['client', 'industry']

  if (!validTypes.includes(type)) {
    throw new Error('Tag type is invalid. Use one of: ', validTypes.join(' '))
  }

  const COLLECTIONS_MAP = { client: 'clientTags', industry: 'industryTags' }

  return db
    .collection(COLLECTIONS_MAP[type])
    .doc()
    .set({tag})
}

function addTheme({ theme }) {
  return db
    .collection('themeTags')
    .doc()
    .set({theme})
}

function searchForKeyLearning({ industryTags = [], clientTags = [], relatedThemes = [] }) {
  const keyLearningsRef = db.collection('keyLearnings')
  const queryRef = keyLearningsRef.where('industryTags', 'array-contains-any', [])
  const results = []

  return new Promise((resolve, reject) => {
    queryRef.limit(5).get().then(querySnapshot => {
      querySnapshot.forEach(doc => {
        results.push(doc.data())
      })
      resolve({ results })
    }).catch(e => reject(e))
  })
} 

function getClientTags() {
  return db.collection('clientTags').get()
}

function getIndustryTags() {
  return db.collection('industryTags').get()
}

function getThemeTags() {
  return db.collection('themeTags').get()
}

module.exports = {
  addKeyLearning,
  searchForKeyLearning,
  getClientTags,
  getIndustryTags,
  getThemeTags,
  addTag,
  addTheme,
  sanitize
}