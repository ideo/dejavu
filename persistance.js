const path = require('path')
const admin = require('firebase-admin');

let serviceAccount = require(path.join(__dirname, './google-credentials-heroku.json'))

admin.initializeApp({ credential: admin.credential.cert(serviceAccount)});

let db = admin.firestore()

let docRef = db.collection('users').doc('alovelace')

function normalize(inputString) {
  return inputString.toLowerCase()
}

function add({
  keyLearning = '', 
  guidingContext = '', 
  clientTags = '', 
  industryTags = '', 
  relatedThemes = '' }) {

  return db
    .collection('keyLearnings')
    .doc()
    .set({keyLearning, guidingContext, clientTags, industryTags, relatedThemes})
}


function search() {

}

function main() {
  let setAda = docRef.set({
    first: 'Ada',
    last: 'Lovelace',
    born: 1815
  })
  let setAlan = docRef.set({
    first: 'Alan',
    last: 'Turing',
    born: 1912
  })
  
  return db.collection('users').get()
    .then((snapshot) => {
      snapshot.forEach((doc) => {
        console.log(doc.id, '=>', doc.data());
      });
    })
    .catch((err) => {
      console.log('Error getting documents', err);
    });
  
}

function getClientTags() {
  return db.collection('clientTags').get()
}

module.exports = {
  add,
  getClientTags
}



