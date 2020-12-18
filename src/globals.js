const uuid = require('uuid');
const bunyan = require('bunyan');
const bunyanLogstashHttp = require('./bunyan-logstash-http');

const buildLogStreams = () => {
  const loggerMetadata = { fromLocal: process.env.DEBUG };
  const logStreams = [];

  if (!/test/.test(process.env.NODE_ENV)) {
    logStreams.push({
      stream: process.stdout,
    });
  }

  if (process.env.MDS_LOG_URL) {
    logStreams.push(
      {
        stream: bunyanLogstashHttp.createLoggerStream({
          loggingEndpoint: process.env.MDS_LOG_URL,
          level: 'debug',
          metadata: loggerMetadata,
        }),
      },
    );
  }

  return logStreams;
};

const logger = bunyan.createLogger({
  name: 'mdsCloudFnProjectMinion',
  level: bunyan.TRACE,
  serializers: bunyan.stdSerializers,
  streams: buildLogStreams(),
});

/**
 * returns the current logger for the application
 */
const getLogger = () => logger;

const delay = (timeout) => new Promise((resolve) => setTimeout(resolve, timeout));

const newUuid = () => uuid.v4();

module.exports = {
  buildLogStreams,
  getLogger,
  delay,
  newUuid,
};
