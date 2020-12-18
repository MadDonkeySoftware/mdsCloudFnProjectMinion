const _ = require('lodash');
const util = require('util');
const url = require('url');
const http = require('http');
const https = require('https');

let retryHandle;
const retryMessages = [];

const nameFromLevel = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

const postMessage = function postMessage(settings, message) {
  const data = JSON.stringify(message);
  const parsedUrl = url.parse(settings.loggingEndpoint);
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length,
    },
  };

  const request = parsedUrl.protocol === 'https:' ? https.request : http.request;

  return new Promise((resolve, reject) => {
    const req = request(options, (res) => {
      const resp = {
        statusCode: res.statusCode,
      };
      res.socket.destroy();
      resolve(resp);
    });
    req.on('error', (err) => {
      /* istanbul ignore next */
      if (err.code !== 'ECONNREFUSED') {
        const msg = util.inspect(err, false, null, true);
        process.stderr.write(`${msg}\n`);
      }
      reject(err);
    });
    req.write(data);
    req.end();
  })
    .then((resp) => {
      const resolve = resp.statusCode < 400;
      return resolve ? Promise.resolve() : Promise.reject();
    });
};

const log = (settings, level, message, metadata) => {
  const meta = _.merge({}, settings.metadata, metadata);
  const timestamp = metadata.time;
  const packagedMessage = {
    '@timestamp': timestamp,
    logLevel: level,
    message,
    ...meta,
  };

  /* istanbul ignore if */
  if (retryMessages.length > 0) {
    retryMessages.push(packagedMessage);
  }
  return postMessage(settings, packagedMessage)
    .catch((err) => {
      /* istanbul ignore if */
      if (err.code === 'ECONNREFUSED') {
        retryMessages.unshift(packagedMessage);
        if (!retryHandle) {
          retryHandle = setInterval(() => {
            const msg = retryMessages.pop();
            postMessage(settings, msg)
              .then(() => {
                if (retryMessages.length === 0) {
                  clearInterval(retryHandle);
                }
              })
              .catch(() => retryMessages.unshift(msg));
          }, 500);
        }
      } else {
        throw err;
      }
    });
};

const write = (settings, record) => {
  let rec = record;
  let message;

  if (typeof rec === 'string') {
    rec = JSON.parse(rec);
  }

  const levelName = nameFromLevel[rec.level];

  try {
    message = settings.customFormatter
      ? { msg: settings.customFormatter(rec, levelName) }
      : { msg: rec.msg };
  } catch (err) {
    if (settings.error) {
      return settings.error(err);
    }

    return Promise.reject(err);
  }

  const meta = _.merge({}, rec, message);
  delete meta.msg;
  return log(settings, levelName, message.msg, meta);
};

/**
 * Constructs a new logger object that emits events to Logstash via HTTP or HTTPS
 *
 * @param {Object} options An object to override settings of the logger.
 * @param {String} options.loggingEndpoint The HTTP/HTTPS logstash host url.
 * @param {Object} [options.metadata] The base set of metadata to send with every log message.
 * @param {Function} [options.error] Callback for when writing an error out occurs.
 * @param {Function} [options.customFormatter] method to custom format message.
 * @param {object} [options.messageRetry] object containing all details around message retrying
 * @param {object} [options.messageRetry.maxAttempts] Times to attempt delivering the message.
 * @returns {Object}
 */
const createLoggerStream = (options) => {
  if (!options || !options.loggingEndpoint) {
    throw new Error('options.loggingEndpoint is required but was not provided');
  }

  const boundWrite = write.bind(undefined, options);

  return {
    write: boundWrite,
  };
};

module.exports = {
  createLoggerStream,
};
