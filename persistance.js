const path = require('path')
const admin = require('firebase-admin');

let serviceAccount = require(path.join(__dirname, './google-credentials-heroku.json'))

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

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
  relatedThemes = [] }) {

  return db
    .collection('keyLearnings')
    .doc()
    .set({
      keyLearning,
      guidingContext,
      clientTags,
      industryTags,
      relatedThemes,
      createdBy,
      createdAt: new Date()
    })
}

function addTag({ tag }, type) {
  const validTypes = ['client', 'industry', 'theme']

  if (!validTypes.includes(type)) {
    throw new Error('Tag type is invalid. Use one of: ', validTypes.join(' '))
  }

  const COLLECTIONS_MAP = { client: 'clientTags', industry: 'industryTags', theme: 'themeTags' }

  return db
    .collection(COLLECTIONS_MAP[type])
    .doc()
    .set({ tag })
}

function dedupeById(results) {
  // TODO: use the `id` attribute to dedupe this list, and return it.
  return results
}

function tryQuery(query, outputArray, nextQueries = []) {

  const rest = nextQueries.map(q => q.get)
  const promises = [query.get, ...rest]

  return Promise.all(promises).then(querySnapshots => {
    const results = []

    querySnapshots.forEach(querySnapshot => {
      if (querySnapshot && querySnapshot.length) {
        console.log(querySnapshot)
        querySnapshot.forEach(doc => {
          results.push(doc.data())
        })
      }

    })

    return results
  }).catch(e => {
    console.log('🚩Query failed ', e)
  })

}

async function getAll() {
  const snapshot = await db.collection('keyLearnings').get()
  return snapshot.docs.map(doc => doc.data());
}

function searchForKeyLearning({ industryTags = [], clientTags = [], themeTags = [] }) {

  console.log(
    '🔎\nSearching for key learning with themeTags: ',
    themeTags,
    '\nclient tags: ',
    clientTags,
    '\nindustryTags: ',
    industryTags
  )

  /* 
    clientTags and themTags actually only ever contain 1 value. So let's 
  */
  const results = [
    /* 1. everything that matches all present criteria  */
    /* 2. everything that matches theme and industry criteria  */
    /* 3. everything that matches theme and client criteria   */
    /* 4. everything that matches theme criteria only */
  ]

  let [industryTag] =  industryTags
  industryTag = sanitize(industryTag)

  let [clientTag] =  clientTags
  clientTag = sanitize(clientTag)

  const keyLearningsRef = db.collection('keyLearnings')

  let queryRef = keyLearningsRef.where(`clientMap.${clientTag}`, '==', true)

  let hasClientTags = clientTags.length > 0
  let hasIndustryTags = industryTags.length > 0

  if (hasIndustryTags) {
    // queryRef = queryRef.where(`clientMap.${clientTag}`, '==', true)
  }

  if (hasClientTags) {
    // queryRef = queryRef.where(`industryMap.${industryTag}`, '==', true)
  }

  return queryRef.get().then(
    querySnapshot => {
      if (querySnapshot.empty) {
        console.log('No matching documents. 😞');
      } 
      querySnapshot.forEach(doc => {
        results.push(doc.data())
      })
      return results
    }
  ).catch(e => {
    console.log('-----> failed at get: ', e)
  })
  
  // let relatedThemeClientQuery = relatedThemeQuery.where('clientTags', 'array-contains-any', clientTags.map(tag => sanitize(tag)))
  // let relatedThemeIndustryQuery = relatedThemeQuery.where('industryTags', 'array-contains-any', industryTags.map(tag => sanitize(tag)))
  // let compoundQuery = relatedThemeIndustryQuery.where('clientTags', 'array-contains-any', clientTags.map(tag => sanitize(tag)))

  

  // let nextQueriesArray = []

  // if (hasIndustryTags) {
  //   nextQueriesArray.push(relatedThemeIndustryQuery)
  // }

  // if (hasClientTags) {
  //   nextQueriesArray.push(relatedThemeClientQuery)
  // }

  // nextQueriesArray.push(relatedThemeQuery)

  
  // 1. perform the query with all criteria
  // return tryQuery(compoundQuery, results, nextQueriesArray)

  // TODO: if the query didn't return any result, change the language to say: "We found no results for all your criteria. These results meet some of your criteria:"

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