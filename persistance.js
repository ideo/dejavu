
// Firebase App (the core Firebase SDK) is always required and
// must be listed before other Firebase SDKs
const firebase = require('firebase/app')

// Add the Firebase products that you want to use
require('firebase/firestore')

// Your web app's Firebase configuration
const firebaseConfig = process.env.FIREBASE_CONFIG
console.log('firebaseConfig: \n\n')
console.log(firebaseConfig)

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig)

let db = app.firestore()
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



