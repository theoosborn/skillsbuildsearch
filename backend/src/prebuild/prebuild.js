const fs = require('fs');
const NLU = require('ibm-watson/natural-language-understanding/v1');
const { IamAuthenticator } = require('ibm-watson/auth');

require('dotenv').config();

// Course dataset containing only courses with Title, Description_short, Link, Topic

const checkboxCats = new Set();
const embeddingCats = new Set();
const datasetWithCats = [];

const nlu = new NLU({
  version: '2022-04-07',
  authenticator: new IamAuthenticator({
    apikey: process.env.API_KEY,
  }),
  serviceUrl: process.env.API_URL,
});

/**
 * A helper function used to reduce the number of requests / second sent to IBM Watson
 * If this function wasn't used, IBM watson would return a 'Too Many Requests' error
 * @function  timeout
 * @param     {*} ms    the number of milliseconds to timeout for
 * @returns   {Promise} a call to setTimeout, to be awaited
 */
function timeout(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Generates some text based of a course's information which is given to IBM watson's NLU
 * @function  getAnalysisText
 * @param     {*}       course  A course object containing: Title, Desc, (Link), Topic
 * @returns   {string}
 *  A piece of text generated from the course object, representing the course
 */
function getAnalysisText(course) {
  return `${course.Title} ${course.Topic} ${course.Description_Short}`;
}

/**
 * Takes the results from IBM watson for a specific course and extracts the relevant
 *  information to be saved to disk
 * @function  processResults
 * @param     {*} course  a course object, containing: Title, Desc, Link, Topic
 * @param     {*} result  the results object returned by IBM watson's `nlu.analyze`
 */
function processResults(course, result) {
  course.Topic
    .split(',')
    .map((topic) => checkboxCats.add(topic.trim()));

  result.result.categories.forEach((cat) => {
    cat.label
      .slice(1) // remove first / from the cats
      .split('/')
      .forEach((label) => {
        embeddingCats.add(label);
      });
  });
  datasetWithCats.push({
    input: course,
    categories: result.result.categories,
  });
}

/**
 * Processes a single course from the dataset, passing it to IBM watson for
 *   Natural Language Understanding analysis, with the results being processes
 *   and saved to disk
 * @function  processCourse
 * @param     {*} course  A course object from the dataset
 * @param     {*} idx     the idx of the course in the dataset, used for timeout
 */
async function processCourse(course, idx) {
  await timeout(idx * 250);
  /* eslint-disable-next-line no-console */
  console.log(`Processing ${course.Title}`);
  const result = await nlu.analyze({
    text: getAnalysisText(course),
    features: {
      categories: {
        limit: 20,
      },
    },
  });

  processResults(course, result);
}

/**
 * Processes the entire dataset by calling the `processCourse` function for each course
 * The results stored in `checkboxCats`, `embeddingCats`, and `datasetWithCats`
 *   are written to disk.
 * @function  processDataset
 * @param {*} path  the path of the dataset file
 * @param {*} dst   the directory for the processed data to be saved to
 */
async function processDataset(path, dst) {
  const dataset = JSON.parse(fs.readFileSync(path, 'utf8'));
  Promise.all(dataset
    .map(processCourse))
    .then(() => {
      fs.writeFileSync(`${dst}/checkbox_categories.json`, JSON.stringify([...checkboxCats], null, 2));
      fs.writeFileSync(`${dst}/embedding_categories.json`, JSON.stringify([...embeddingCats], null, 2));
      fs.writeFileSync(`${dst}/dataset_with_categories.json`, JSON.stringify(datasetWithCats, null, 2));
      /* eslint-disable-next-line no-console */
      console.log('Data saved to disk.');
    });
}

module.exports = {
  timeout,
  getAnalysisText,
  processResults,
  processCourse,
  processDataset,
};
