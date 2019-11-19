
// Firebase App (the core Firebase SDK) is always required and
// must be listed before other Firebase SDKs
const firebase = require('firebase/app')

// Add the Firebase products that you want to use
require('firebase/firestore')

// Your web app's Firebase configuration
const firebaseConfig = process.env.FIREBASE_CONFIG
const { apiKey, authDomain, projectId } = firebaseConfig

console.log(firebaseConfig, 'apiKey: ', apiKey, ' authDomain', authDomain, 'projectId', projectId)

// Initialize Firebase
firebase.initializeApp({ apiKey, authDomain, projectId })

var db = firebase.firestore();
let docRef = db.collection('users').doc('alovelace')

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

module.exports = {
  main
}



