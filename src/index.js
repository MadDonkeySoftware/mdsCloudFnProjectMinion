const _ = require('lodash');
const mds = require('@maddonkeysoftware/mds-cloud-sdk-node');

const globals = require('./globals');
const helpers = require('./helpers');
const logic = require('./logic');

const BUILD_COMPLETE = 'buildComplete';
const BUILD_FAILED = 'buildFailed';
const IGNORE_STATUSES = [
  BUILD_COMPLETE,
  BUILD_FAILED,
];

const handleEvent = (event, context) => {
  if (_.includes(IGNORE_STATUSES, event.message.status)) {
    return Promise.resolve();
  }

  const workQueue = helpers.getEnvVar('MDS_FN_WORK_QUEUE');
  const workQueueDlq = helpers.getEnvVar('MDS_FN_WORK_QUEUE_DLQ');
  const {
    nsClient,
    qsClient,
    fsClient,
    notificationTopic,
    logger,
  } = context;

  logger.debug({ event }, 'Event received by worker.');

  return qsClient.fetchMessage(workQueue).then(async (message) => {
    if (message) {
      logger.debug({ event }, 'Queue item obtained by worker');

      try {
        const queueMessage = JSON.parse(message.message);
        await logic.buildFunction(queueMessage);
        logger.debug({ queueMessage }, 'Emitting build complete');
        await nsClient.emit(notificationTopic, {
          eventId: event.message.eventId,
          status: BUILD_COMPLETE,
        });

        logger.debug('Preparing to delete queue message.');

        await fsClient.deleteContainerOrPath(`${queueMessage.sourceContainer}/${queueMessage.sourcePath}`);
        await qsClient.deleteMessage(workQueue, message.id);
        logger.debug('Queue message deleted.');
      } catch (err) {
        logger.warn({ err }, 'Failed to build function.');
        await qsClient.enqueueMessage(workQueueDlq, message.message);
        await qsClient.deleteMessage(workQueue, message.id);
        await nsClient.emit(notificationTopic, {
          eventId: event.message.eventId,
          status: BUILD_FAILED,
        });
      }
    }
  }).catch((err) => {
    logger.warn({ err }, 'Failed to obtain queue message');
    throw err;
  });
};

const buildDaemon = () => {
  const nsClient = mds.getNotificationServiceClient(helpers.getEnvVar('MDS_FN_NS_URL'));
  const qsClient = mds.getQueueServiceClient(helpers.getEnvVar('MDS_FN_QS_URL'));
  const fsClient = mds.getFileServiceClient(helpers.getEnvVar('MDS_FN_FS_URL'));
  const notificationTopic = helpers.getEnvVar('MDS_FN_NOTIFICATION_TOPIC');
  const logger = globals.getLogger();

  return {
    start: () => {
      const context = {
        nsClient,
        qsClient,
        fsClient,
        notificationTopic,
        logger,
      };
      nsClient.on(notificationTopic, (event) => module.exports.handleEvent(event, context));
    },
    stop: () => nsClient.close(),
  };
};

module.exports = {
  handleEvent,
  buildDaemon,
};
