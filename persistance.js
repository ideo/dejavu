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
  keyLearning = '',
  guidingContext = '', 
  clientTags = [], 
  industryTags = [], 
  relatedThemeTags = [] }) {

  return db
    .collection('keyLearnings')
    .doc()
    .set({
      keyLearning, 
      guidingContext,  
      clientTags, 
      industryTags, 
      relatedThemeTags,
      createdBy, 
      createdAt: new Date() 
  })
}

function addTag({tag}, type) {
  const validTypes = ['client', 'industry', 'theme']

  if (!validTypes.includes(type)) {
    throw new Error('Tag type is invalid. Use one of: ', validTypes.join(' '))
  }

  const COLLECTIONS_MAP = { client: 'clientTags', industry: 'industryTags', theme: 'themeTags' }

  return db
    .collection(COLLECTIONS_MAP[type])
    .doc()
    .set({tag})
}

function searchForKeyLearning({ industryTags = [], clientTags = [], themeTags = [] }) {
  const keyLearningsRef = db.collection('keyLearnings')

  console.log('-----> themeTags', themeTags)
  console.log('-----> clientTags', clientTags)
  console.log('-----> industryTags', industryTags)

  let queryRef = keyLearningsRef.where('relatedThemes', 'array-contains-any', themeTags.map(tag => sanitize(tag)))

  if (industryTags.length > 0) {
    queryRef = queryRef.where('industryTags', 'array-contains-any', industryTags.map(tag => sanitize(tag)))
  }

  if (clientTags.length > 0) {
    queryRef = queryRef.where('clientTags', 'array-contains-any', clientTags.map(tag => sanitize(tag)))
  }

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
  sanitize
}