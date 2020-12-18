const _ = require('lodash');
const MongoClient = require('mongodb');

const getMongoUrl = (env) => _.get(env, ['MDS_FN_MONGO_URL'], 'mongodb://127.0.0.1:27017');
const getMongoDbName = (env) => _.get(env, ['MDS_FN_MONGO_DB_NAME'], 'mdsCloudServerlessFunctions');

const defaultOptions = { useNewUrlParser: true, useUnifiedTopology: true };

const getDatabase = (url, options) => {
  const connUrl = url || getMongoUrl(process.env);
  const opts = _.merge({}, defaultOptions, options);

  return MongoClient.connect(connUrl, opts).then((client) => {
    const db = client.db(getMongoDbName(process.env));
    const wrappedDb = {
      getCollection: (name) => db.collection(name),
      close: () => client.close(),
    };
    return Promise.resolve(wrappedDb);
  });
};

module.exports = {
  getMongoUrl,
  getMongoDbName,
  getDatabase,
};
