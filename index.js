#!/usr/bin/env node
process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';
var configModule = require('config');
config = configModule.util.loadFileConfigs(__dirname + '/config/');
require('dotenv').config(config['env']);
const converter = require('openapi-to-postmanv2');
const collection = require('./lib/collection');
const fetch = require('./lib/fetch');
const merger = require('./lib/merger');
const cliSpinners = require('cli-spinners');
const Spinnies = require('spinnies');

const spinner = new Spinnies({
  color: 'blueBright',
  spinnerColor: 'blueBright',
  succeedColor: 'green',
  spinner: cliSpinners.dots,
});

const program = require('commander');
program
  .version('1.0.0')
  .option('-s --service <service>', 'which service to convert')
  .option(
    '-r --replace [repliaces]',
    'comma split api name which will replace not merge'
  )
  .option('-c --collection <collection>', 'collection name')
  .option('-u --url <url>', 'swagger url')
  .parse(process.argv);

var serviceConfig = config[program.service];
var url = program.url || serviceConfig.swagger_url;
var collectionName = program.collection || serviceConfig.collection_name;

//run update
update().catch((err) => {
  console.error('run failed,' + err);
});

//get swagger json
async function getSwaggerJson(url) {
  return fetch({
    url: url,
    methods: 'get',
  })
    .then((response) => {
      return response.data;
    })
    .catch((err) => {
      console.log(err);
      console.log('get swagger json failed: ' + err.message);
      process.exit(-1);
    });
}

async function update() {
  spinner.add('update', { text: 'Starting update' });
  var swaggerJson = await getSwaggerJson(url);
  //add postman collection used info
  swaggerJson['info'] = {
    title: collectionName,
    description: collectionName + ' api',
    version: '1.0.0',
    _postman_id: '807bb824-b333-4b59-a6ef-a8d46d3b95bf',
  };
  var converterInputData = {
    type: 'json',
    data: swaggerJson,
  };

  spinner.update('update', { text: 'Converting to postman collection' });
  //use postman tool convert to postman collection
  converter.convert(
    converterInputData,
    { folderStrategy: 'Tags' },
    async (_a, res) => {
      if (res.result === false) {
        console.log('convert failed');
        console.log(res.reason);
        return;
      }
      var convertedJson = res.output[0].data;

      var id = await collection.getCollectionId(collectionName);
      if (id === null) {
        return;
      }
      var collectionJson = {
        collection: {
          info: {
            name: collectionName,
            description: collectionName + ' api',
            _postman_id: id,
            schema:
              'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
          },
          item: convertedJson.item,
        },
      };
      var savedCollection = await collection.getCollectionDetail(id);
      var mergedCollection = merger.merge(savedCollection, collectionJson);

      spinner.update('update', { text: 'Updating collection' });
      collection.updateCollection(id, mergedCollection, spinner);
    }
  );
}

module.exports = {
  spinner,
};
