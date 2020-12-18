/* eslint-disable no-unused-expressions */
const chai = require('chai');

const globals = require('./globals');

describe('globals', () => {
  describe('getLogger', () => {
    it('Returns a logger', () => {
      // Act
      const logger = globals.getLogger();

      // Assert
      chai.expect(logger.debug).to.not.be.undefined;
      chai.expect(logger.error).to.not.be.undefined;
      chai.expect(logger.info).to.not.be.undefined;
      chai.expect(logger.trace).to.not.be.undefined;
      chai.expect(logger.warn).to.not.be.undefined;
    });
  });

  describe('buildLogStreams', () => {
    it('Includes bunyan logstash http stream when MDS_LOG_URL present', () => {
      // Arrange
      const beforeValueNodeEnv = process.env.NODE_ENV;
      const beforeValueMdsLogUrl = process.env.MDS_LOG_URL;

      process.env.MDS_LOG_URL = 'http://127.0.0.1:8080';
      process.env.NODE_ENV = undefined;

      try {
        // Act
        const streams = globals.buildLogStreams();

        // Assert
        chai.expect(streams.length).to.be.eql(2);
        chai.expect(streams[0].stream).to.eql(process.stdout);
        chai.expect(streams[1].stream).to.not.eql(process.stdout);
      } finally {
        // Cleanup
        process.env.MDS_LOG_URL = beforeValueMdsLogUrl;
        process.env.NODE_ENV = beforeValueNodeEnv;
      }
    });
  });

  describe('delay', () => {
    it('Delays for the provided duration', () => {
      // Arrange
      const start = new Date().getTime();
      const delay = 10;

      // Act
      return globals.delay(delay).then(() => {
        // Assert
        const done = new Date().getTime();
        const drift = done - start - delay;

        chai.expect(drift).to.be.lessThan(3);
      });
    });
  });

  describe('newUuid', () => {
    it('Generates a new UUID each call', () => {
      // Arrange
      const regex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

      // Act
      const newId = globals.newUuid();

      // Assert
      chai.expect(newId).to.match(regex);
    });
  });
});
