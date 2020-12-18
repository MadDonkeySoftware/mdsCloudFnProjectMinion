// http://petstore.swagger.io/?url=https://raw.githubusercontent.com/fnproject/fn/master/docs/swagger_v2.yml
// http://192.168.5.90:8080/v2/fns?app_id=01DNG262GXNG8G00GZJ0000010
const _ = require('lodash');
const axios = require('axios');
const buildUrl = require('build-url');

const globals = require('../globals');

const NAME = 'fnProject';

const logger = globals.getLogger();

const getFnProjectUrl = (env) => _.get(env, ['MDS_FN_FNPROJECT_URL'], 'http://127.0.0.1:8080');

/**
 *
 * @param {object} data
 * @param {string} data.path
 * @param {object} [data.body]
 * @param {string} data.httpVerb
 */
const makeRequest = async (data) => {
  const requestOptions = {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  };

  const url = buildUrl(getFnProjectUrl(process.env), data);

  switch (data.httpVerb.toUpperCase()) {
    case 'GET':
      return axios.get(url, requestOptions);
    case 'POST':
      return axios.post(url, data.body, requestOptions);
    case 'PUT':
      return axios.put(url, data.body, requestOptions);
    default:
      throw new Error(`HTTP verb "${data.httpVerb}" not understood.`);
  }
};

const getAppsPagedData = async ({
  runningData,
  dataKey,
  delay = 500,
  tries = 1,
}) => {
  const reqData = { path: '/v2/apps', httpVerb: 'get' };
  if (dataKey) {
    reqData.queryParams = {
      cursor: dataKey,
    };
  }

  const resp = await makeRequest(reqData);
  if (resp.status === 200) {
    const newRunningData = _.concat([], runningData, resp.data.items);
    if (resp.data.next_cursor) {
      return getAppsPagedData({
        runningData: newRunningData,
        dataKey: resp.data.next_cursor,
        delay,
        tries: 1,
      });
    }
    return newRunningData;
  }
  logger.warn({ status: resp.status, response: resp.data }, 'Failed to get application list in fnProject.');
  if (tries <= 3) {
    return globals.delay(delay).then(() => getAppsPagedData({
      runningData,
      dataKey,
      delay: delay * tries,
      tries: tries + 1,
    }));
  }

  logger.error({ status: resp.status, response: resp.data }, 'Failed to get application list in fnProject and retries exhausted.');
  throw new Error('Could not get application list from provider');
};

const getApps = async () => {
  const data = await getAppsPagedData({ runningData: [] });
  return data;
};

const createApp = async (name) => {
  const body = { name };
  const resp = await makeRequest({ path: '/v2/apps', httpVerb: 'post', body });
  if (resp.status === 200) {
    return resp.data.id;
  }
  logger.warn({ status: resp.status, response: resp.data }, 'Failed to create application in fnProject.');
  return undefined;
};

const findAppIdByName = async (name) => {
  const apps = await getApps();
  const item = _.find(apps, (e) => e.name === name);
  return _.get(item, ['id']);
};

const createFunction = async (name, appId, image) => {
  const body = {
    name,
    app_id: appId,
    image,
  };
  const resp = await makeRequest({ path: '/v2/fns', httpVerb: 'post', body });
  if (resp.status === 200) {
    return resp.data;
  }
  logger.warn({ status: resp.status, response: resp.data }, 'Failed to create application in fnProject.');
  return undefined;
};

const updateFunction = async (funcId, appId, image) => {
  const body = {
    image,
  };
  const resp = await makeRequest({ path: `/v2/fns/${funcId}`, httpVerb: 'put', body });
  if (resp.status === 200) {
    return resp.data;
  }
  logger.warn({ status: resp.status, response: resp.data }, 'Failed to update application in fnProject.');
  return undefined;
};

module.exports = {
  NAME,
  getFnProjectUrl,
  createApp,
  findAppIdByName,
  createFunction,
  updateFunction,
};
