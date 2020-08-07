const path = require('path')
const admin = require('firebase-admin');
const uniqBy = require('lodash.uniqby')

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

function searchForKeyLearning({ industryTags = [], clientTags = [], themeTags = [], cursor = 0, limit = 5 }) {

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

  /* 
    clientTags and themeTags actually only ever contain 1 value. So let's destructure that
  */  
  let [industryTag] =  industryTags
  if (industryTag) { industryTag = sanitize(industryTag) }


  let [clientTag] = clientTags
  if (clientTag) { clientTag = sanitize(clientTag) }

  const keyLearningsRef = db.collection('keyLearnings')
  const sanitizedThemeTags = themeTags.map(tag => sanitize(tag))
  
  console.log(`
    \n
    theme tags, sanitized:
    ${sanitizedThemeTags}
    \n
  `)

  let queryRef = keyLearningsRef.where('relatedThemes', 'array-contains-any', sanitizedThemeTags)

  let hasClientTags = clientTags.length > 0
  let hasIndustryTags = industryTags.length > 0

  if (hasClientTags) {  
    //console.log(' -> has client tags ', clientTag)
    //queryRef = queryRef.where(`clientMap.${clientTag}`, '==', true)
  }

  if (hasIndustryTags) {
    //console.log(' -> has industry tags ', industryTag)
    //queryRef = queryRef.where(`industryMap.${industryTag}`, '==', true)
  }

  const promises = []

  promises.push(queryRef.get().then(
    querySnapshot => {
      if (querySnapshot.empty) {
        console.log('No matching documents for key . 😞');
      } 
      querySnapshot.forEach(doc => {
        results.push(Object.assign({}, doc.data(), {id: doc.id}))
      })
      return results
    }
  ).catch(e => {
    console.log('-----> failed at get: ', e)
  }))
  
  if (hasIndustryTags) {
    promises.push(keyLearningsRef.where(`industryMap.${industryTag}`, '==', true).get().then(
      querySnapshot => {
        if (querySnapshot.empty) {
          console.log('No matching documents for industry map 😞');
        } 
        querySnapshot.forEach(doc => {
          results.push(Object.assign({}, doc.data(), {id: doc.id}))
        })
        return results
      }
    ))
  }

  if (hasClientTags) {
    promises.push(keyLearningsRef.where(`clientMap.${clientTag}`, '==', true).get().then(
      querySnapshot => {
        if (querySnapshot.empty) {
          console.log('No matching documents for client map 😞');
        } 
        querySnapshot.forEach(doc => {
          results.push(Object.assign({}, doc.data(), {id: doc.id}))
        })
        return results
      }
    ))
  }

  return Promise.all(promises).then(([ themes, industry, client ]) => {
    let res = [...themes]
    if (industry) {
      res = [...res, ...industry]
      // [Any theme matched, industry matched, client matched]
      // How many results matched ALL themes
      // How many results matched SOME themes
      // How many results matched industry
      // How many results matched client
    }
    if (client) {
      res = [...res, ...client]
    }
    console.log('\n******** id ', res.map(({id}) => id), '\n')
    console.log('\n length w/o uniq ', res.length, ' \n length w uniq ', uniqBy(res, 'id').length, ' cursor: ', cursor, 'limit ', limit)
    const results = uniqBy(res, 'id')
    return {
      results: results.filter((_, index) => (index >= cursor && index < (cursor + limit))),
      total: results.length 
    }
  }).catch(e => {
    console.log('-> Promise all failed at #searchForKeyLearnings ', e)
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