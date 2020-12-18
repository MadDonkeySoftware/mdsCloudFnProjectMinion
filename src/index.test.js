/* eslint-disable no-unused-expressions */

const chai = require('chai');
const sinon = require('sinon');
const chaiAsPromised = require('chai-as-promised');

const mds = require('@maddonkeysoftware/mds-cloud-sdk-node');

const globals = require('./globals');
const root = require('./index');
const logic = require('./logic');
const helpers = require('./helpers');

chai.use(chaiAsPromised);

const buildFakeLogger = () => ({
  debug: sinon.stub(),
  warn: sinon.stub(),
});

const buildEvent = (id, status) => ({
  message: {
    id,
    eventId: 'testEventId',
    status,
  },
});

describe('src/index', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('handleEvent', () => {
    it('if event "buildComplete" skip processing', () => {
      // Arrange
      const event = buildEvent(1, 'buildComplete');
      const context = {};

      // Act
      return chai.expect(root.handleEvent(event, context)).to.eventually.be.fulfilled;
    });

    it('if event "buildFailed" skip processing', () => {
      // Arrange
      const event = buildEvent(1, 'buildFailed');
      const context = {};

      // Act
      return chai.expect(root.handleEvent(event, context)).to.eventually.be.fulfilled;
    });

    it('resolves when no message in queue', () => {
      // Arrange
      const event = buildEvent(1);
      const context = {
        nsClient: {
        },
        qsClient: {
          fetchMessage: sinon.stub().withArgs('testWorkQueue').resolves(),
        },
        fsClient: {
        },
        notificationTopic: 'testTopic',
        logger: buildFakeLogger(),
      };
      sinon.stub(helpers, 'getEnvVar')
        .withArgs('MDS_FN_WORK_QUEUE')
        .returns('testWorkQueue')
        .withArgs('MDS_FN_WORK_QUEUE_DLQ')
        .returns('testWorkDLQ');

      // Act
      return chai.expect(root.handleEvent(event, context)).to.eventually.be.fulfilled;
    });

    describe('if no event status', () => {
      it('when build is successful should emit "buildComplete" event', () => {
        // Arrange
        const event = buildEvent(1);
        const queueMessage = {
          id: 'messageId',
          message: JSON.stringify({ build: 'message' }),
        };
        const context = {
          nsClient: {
            emit: sinon.stub(),
          },
          qsClient: {
            fetchMessage: sinon.stub().withArgs('testWorkQueue').resolves(queueMessage),
            deleteMessage: sinon.stub().withArgs('testWorkQueue', 'messageId').resolves(),
          },
          fsClient: {
            deleteContainerOrPath: sinon.stub().resolves(),
          },
          notificationTopic: 'testTopic',
          logger: buildFakeLogger(),
        };
        sinon.stub(helpers, 'getEnvVar')
          .withArgs('MDS_FN_WORK_QUEUE')
          .returns('testWorkQueue')
          .withArgs('MDS_FN_WORK_QUEUE_DLQ')
          .returns('testWorkDLQ');
        sinon.stub(logic, 'buildFunction').withArgs(sinon.match({ build: 'message' })).resolves();

        // Act
        return chai.expect(root.handleEvent(event, context)).to.eventually.be.fulfilled.then(() => {
          // Assert
          chai.expect(context.nsClient.emit.callCount).to.equal(1);
          chai.expect(context.nsClient.emit.getCall(0).args).to.deep.equal([
            'testTopic',
            {
              eventId: 'testEventId',
              status: 'buildComplete',
            },
          ]);
        });
      });

      it('when build fails should emit "buildFailed" event', () => {
        // Arrange
        const event = buildEvent(1);
        const queueMessage = {
          id: 'messageId',
          message: 'non-json message',
        };
        const context = {
          nsClient: {
            emit: sinon.stub(),
          },
          qsClient: {
            fetchMessage: sinon.stub().withArgs('testWorkQueue').resolves(queueMessage),
            deleteMessage: sinon.stub().withArgs('testWorkQueue', 'messageId').resolves(),
            enqueueMessage: sinon.stub(),
          },
          notificationTopic: 'testTopic',
          logger: buildFakeLogger(),
        };
        sinon.stub(helpers, 'getEnvVar')
          .withArgs('MDS_FN_WORK_QUEUE')
          .returns('testWorkQueue')
          .withArgs('MDS_FN_WORK_QUEUE_DLQ')
          .returns('testWorkDLQ');

        // Act
        return chai.expect(root.handleEvent(event, context)).to.eventually.be.fulfilled.then(() => {
          // Assert
          chai.expect(context.nsClient.emit.callCount).to.equal(1);
          chai.expect(context.nsClient.emit.getCall(0).args).to.deep.equal([
            'testTopic',
            {
              eventId: 'testEventId',
              status: 'buildFailed',
            },
          ]);
          chai.expect(context.qsClient.enqueueMessage.callCount).to.equal(1);
          chai.expect(context.qsClient.enqueueMessage.getCall(0).args).to.deep.equal([
            'testWorkDLQ',
            'non-json message',
          ]);
        });
      });

      it('when queue fetch fails logs message', () => {
        // Arrange
        const event = buildEvent(1);
        const testError = new Error('test error');
        const context = {
          qsClient: {
            fetchMessage: sinon.stub().rejects(testError),
          },
          notificationTopic: 'testTopic',
          logger: buildFakeLogger(),
        };
        sinon.stub(helpers, 'getEnvVar')
          .withArgs('MDS_FN_WORK_QUEUE')
          .returns('testWorkQueue')
          .withArgs('MDS_FN_WORK_QUEUE_DLQ')
          .returns('testWorkDLQ');

        // Act
        return chai.expect(root.handleEvent(event, context)).to.eventually.be
          .rejectedWith('test error').then(() => {
            // Assert
            chai.expect(context.logger.warn.callCount).to.equal(1);
            chai.expect(context.logger.warn.getCall(0).args).to.deep.equal([
              { err: testError },
              'Failed to obtain queue message',
            ]);
          });
      });
    });
  });

  describe('buildDaemon', () => {
    describe('start', () => {
      it('calls handler when nsClient event fired', () => {
        // Arrange
        let nsCb;
        const fakeNsClient = {
          on: (topic, cb) => {
            if (topic === 'testTopic') nsCb = cb;
          },
        };
        const fakeQsClient = {};
        const fakeFsClient = {};
        const fakeLogger = {};
        const fakeEvent = {};
        sinon.stub(helpers, 'getEnvVar')
          .withArgs('MDS_FN_NS_URL')
          .returns('nsUrl')
          .withArgs('MDS_FN_QS_URL')
          .returns('qsUrl')
          .withArgs('MDS_FN_FS_URL')
          .returns('fsUrl')
          .withArgs('MDS_FN_NOTIFICATION_TOPIC')
          .returns('testTopic');
        sinon.stub(mds, 'getNotificationServiceClient').withArgs('nsUrl').returns(fakeNsClient);
        sinon.stub(mds, 'getQueueServiceClient').withArgs('qsUrl').returns(fakeQsClient);
        sinon.stub(mds, 'getFileServiceClient').withArgs('fsUrl').returns(fakeFsClient);
        sinon.stub(globals, 'getLogger').returns(fakeLogger);
        sinon.stub(root, 'handleEvent');

        // Act
        const daemon = root.buildDaemon();
        daemon.start();
        nsCb(fakeEvent);

        // Assert
        chai.expect(root.handleEvent.callCount).to.equal(1);
        chai.expect(root.handleEvent.getCall(0).args).to.deep.equal([
          fakeEvent,
          {
            nsClient: fakeNsClient,
            qsClient: fakeQsClient,
            fsClient: fakeFsClient,
            notificationTopic: 'testTopic',
            logger: fakeLogger,
          },
        ]);
      });
    });

    describe('stop', () => {
      it('calls nsClient close', () => {
        // Arrange
        const fakeNsClient = {
          close: sinon.stub(),
        };
        sinon.stub(helpers, 'getEnvVar').withArgs('MDS_FN_NS_URL').returns('nsUrl');
        sinon.stub(mds, 'getNotificationServiceClient').withArgs('nsUrl').returns(fakeNsClient);
        sinon.stub(mds, 'getQueueServiceClient').returns();
        sinon.stub(mds, 'getFileServiceClient').returns();

        // Act
        const daemon = root.buildDaemon();
        daemon.stop();

        // Assert
        chai.expect(fakeNsClient.close.callCount).to.equal(1);
      });
    });
  });
});
