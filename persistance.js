const path = require('path')
const admin = require('firebase-admin');

let serviceAccount = require(path.join(__dirname, './google-credentials-heroku.json'))

admin.initializeApp({ credential: admin.credential.cert(serviceAccount)});

let db = admin.firestore()

function normalize(inputString) {
  return inputString.toLowerCase()
}

function addKeyLearning({
  topic = '',
  keyLearning = '',
  guidingContext = '', 
  clientTags = '', 
  industryTags = '', 
  relatedThemes = '' }) {

  return db
    .collection('keyLearnings')
    .doc()
    .set({topic, keyLearning, guidingContext, clientTags, industryTags, relatedThemes})
}


function search() {

}

function getClientTags() {
  return db.collection('clientTags').get()
}

function getIndustryTags() {
  return db.collection('industryTags').get()
}

module.exports = {
  addKeyLearning,
  getClientTags,
  getIndustryTags
}



