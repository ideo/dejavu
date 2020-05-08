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

function dedupeById(results) {
  // TODO: use the `id` attribute to dedupe this list, and return it.
  return results
}

function tryQuery(query, outputArray, nextQueries = []) {

  return query.get().then(querySnapshot => {
    if (querySnapshot.empty) {
      console.log('No results found for query ', query)
    }
    querySnapshot.forEach(doc => {
      outputArray.push(doc.data())
    })
    const _nextQueries = [...nextQueries]
    const _nextQuery = _nextQueries.shift()
    if (_nextQuery) {
      return tryQuery(_nextQuery, outputArray, _nextQueries)
    }
  }).catch(e => console.log('🚩Query failed ', e))

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

  const results = [
    /* 1. everything that matches all present criteria  */
    /* 2. everything that matches theme and industry criteria  */
    /* 3. everything that matches theme and client criteria   */
    /* 4. everything that matches theme criteria only */
  ]

  const keyLearningsRef = db.collection('keyLearnings')

  let relatedThemeQuery = keyLearningsRef.where('relatedThemes', 'array-contains-any', themeTags.map(tag => sanitize(tag)))
  let relatedThemeClientQuery = relatedThemeQuery.where('clientTags', 'array-contains-any', clientTags.map(tag => sanitize(tag)))
  let relatedThemeIndustryQuery = relatedThemeQuery.where('industryTags', 'array-contains-any', industryTags.map(tag => sanitize(tag)))
  let compoundQuery = relatedThemeIndustryQuery.where('clientTags', 'array-contains-any', clientTags.map(tag => sanitize(tag)))

  let hasClientTags = clientTags.length > 0
  let hasIndustryTags = industryTags.length > 0

  let nextQueriesArray = []
  
  if (hasIndustryTags) {
    nextQueriesArray.push(relatedThemeIndustryQuery)
  }

  if (hasClientTags) {
    nextQueriesArray.push(relatedThemeClientQuery)
  }

  nextQueriesArray.push(relatedThemeQuery)

  // 1. perform the query with all criteria
  return tryQuery(compoundQuery, results, nextQueriesArray)
  
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