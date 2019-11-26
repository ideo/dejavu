const path = require('path')
const admin = require('firebase-admin');

let serviceAccount = require(path.join(__dirname, './google-credentials-heroku.json'))

admin.initializeApp({ credential: admin.credential.cert(serviceAccount)});

let db = admin.firestore()

function normalize(inputString) {
  return inputString.toLowerCase()
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

function searchForKeyLearning({ industryTag }) {
  const keyLearningsRef = db.collection('keyLearnings')
  const queryRef = keyLearningsRef.where('industryTags', 'array-contains', industryTag)
  const results = []
  queryRef.get().then(querySnapshot => {
    querySnapshot.forEach(doc => {
      results.push(doc.data())
    })
  })
  return Promise.resolve(results)
} 

function getClientTags() {
  return db.collection('clientTags').get()
}

function getIndustryTags() {
  return db.collection('industryTags').get()
}

module.exports = {
  addKeyLearning,
  searchForKeyLearning,
  getClientTags,
  getIndustryTags,
  addTag
}