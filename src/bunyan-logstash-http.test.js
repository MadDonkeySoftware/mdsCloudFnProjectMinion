/* eslint-disable no-unused-expressions */
const _ = require('lodash');
const chai = require('chai');
const sinon = require('sinon');
const http = require('http');
const https = require('https');

const bunyanLogstashHttp = require('./bunyan-logstash-http');

describe('bunyan-logstash-http', () => {
  afterEach(() => {
    sinon.restore();
  });

  const createBunyanLogRecord = (args) => {
    const defaults = {
      name: 'from test',
      hostname: 'test host',
      pid: -1,
      level: 30,
      msg: 'test',
      time: '2020-01-01T12:00:00.000Z',
      v: 0,
    };

    const o = _.merge({}, defaults, args);

    return JSON.stringify(o);
  };

  const stubRequest = (source, response) => {
    const resp = _.merge({},
      {
        statusCode: 200,
        socket: {
          destroy: sinon.stub(),
        },
      },
      response);
    const requestStub = {
      on: sinon.stub(),
      write: sinon.stub(),
      end: sinon.stub(),
    };
    const methodStub = sinon.stub(source, 'request')
      .callsFake((opts, cb) => {
        setTimeout(() => {
          cb(resp);
        }, 1);
        return requestStub;
      });

    return {
      requestMethodStub: methodStub,
      requestStub,
    };
  };

  const stubFailingRequest = (source) => {
    const requestStub = {
      on: sinon.stub().callsFake((key, cb) => {
        setTimeout(() => {
          cb(new Error('test error'), 1);
        });
      }),
      write: sinon.stub(),
      end: sinon.stub(),
    };
    const methodStub = sinon.stub(source, 'request')
      .returns(requestStub);

    return {
      requestMethodStub: methodStub,
      requestStub,
    };
  };

  describe('createLoggerStream', () => {
    it('Creates a object with a write method', () => {
      // Act
      const obj = bunyanLogstashHttp.createLoggerStream({
        loggingEndpoint: 'http://127.0.0.1:8080',
      });

      // Assert
      chai.expect(obj).to.not.be.undefined;
    });

    it('Throws error when loggingEndpoint not provided', () => {
      // Arrange / Act / Assert
      chai.expect(bunyanLogstashHttp.createLoggerStream).to.throw(
        /options\.loggingEndpoint is required but was not provided/,
      );
    });

    it('Write method emits log message to http', () => {
      // Arrange
      const obj = bunyanLogstashHttp.createLoggerStream({
        loggingEndpoint: 'http://127.0.0.1:8080',
        level: 'debug',
      });
      const { requestMethodStub, requestStub } = stubRequest(http);
      const logRecord = createBunyanLogRecord({ msg: 'test' });

      // Act
      return obj.write(logRecord).then(() => {
        const expectedLog = '{"@timestamp":"2020-01-01T12:00:00.000Z","logLevel":"INFO","message":"test","name":"from test","hostname":"test host","pid":-1,"level":30,"time":"2020-01-01T12:00:00.000Z","v":0}';

        // Assert
        chai.expect(requestMethodStub.callCount).to.eql(1);
        chai.expect(requestStub.write.callCount).to.eql(1);
        chai.expect(requestStub.write.firstCall.args[0]).to.eql(expectedLog);
        chai.expect(requestStub.end.callCount).to.eql(1);
      });
    });

    it('Write method emits log message to https', () => {
      // Arrange
      const obj = bunyanLogstashHttp.createLoggerStream({
        loggingEndpoint: 'https://127.0.0.1:8080',
        level: 'debug',
      });
      const { requestMethodStub, requestStub } = stubRequest(https);
      const logRecord = createBunyanLogRecord({ msg: 'test' });

      // Act
      return obj.write(logRecord).then(() => {
        const expectedLog = '{"@timestamp":"2020-01-01T12:00:00.000Z","logLevel":"INFO","message":"test","name":"from test","hostname":"test host","pid":-1,"level":30,"time":"2020-01-01T12:00:00.000Z","v":0}';

        // Assert
        chai.expect(requestMethodStub.callCount).to.eql(1);
        chai.expect(requestStub.write.callCount).to.eql(1);
        chai.expect(requestStub.write.firstCall.args[0]).to.eql(expectedLog);
        chai.expect(requestStub.end.callCount).to.eql(1);
      });
    });

    it('Write method uses custom formatter when present', () => {
      // Arrange
      const obj = bunyanLogstashHttp.createLoggerStream({
        loggingEndpoint: 'http://127.0.0.1:8080',
        level: 'debug',
        customFormatter: () => 'from custom formatter',
      });
      const { requestMethodStub, requestStub } = stubRequest(http);
      const logRecord = createBunyanLogRecord({ msg: 'test' });

      // Act
      return obj.write(logRecord).then(() => {
        const expectedLog = '{"@timestamp":"2020-01-01T12:00:00.000Z","logLevel":"INFO","message":"from custom formatter","name":"from test","hostname":"test host","pid":-1,"level":30,"time":"2020-01-01T12:00:00.000Z","v":0}';

        // Assert
        chai.expect(requestMethodStub.callCount).to.eql(1);
        chai.expect(requestStub.write.callCount).to.eql(1);
        chai.expect(requestStub.write.firstCall.args[0]).to.eql(expectedLog);
        chai.expect(requestStub.end.callCount).to.eql(1);
      });
    });

    it('Write method can handle object record', () => {
      // Arrange
      const obj = bunyanLogstashHttp.createLoggerStream({
        loggingEndpoint: 'http://127.0.0.1:8080',
        level: 'debug',
      });
      const { requestMethodStub, requestStub } = stubRequest(http);
      const logRecord = { msg: 'test' };

      // Act
      return obj.write(logRecord).then(() => {
        const expectedLog = '{"message":"test"}';

        // Assert
        chai.expect(requestMethodStub.callCount).to.eql(1);
        chai.expect(requestStub.write.callCount).to.eql(1);
        chai.expect(requestStub.write.firstCall.args[0]).to.eql(expectedLog);
        chai.expect(requestStub.end.callCount).to.eql(1);
      });
    });

    it('Rejects with error when write errors and no custom error handler', () => {
      // Arrange
      const obj = bunyanLogstashHttp.createLoggerStream({
        loggingEndpoint: 'http://127.0.0.1:8080',
        level: 'debug',
        customFormatter: () => { throw new Error('test error'); },
      });
      const { requestMethodStub } = stubRequest(http);
      const logRecord = { msg: 'test' };

      // Act
      return obj.write(logRecord)
        .then(() => new chai.AssertionError('Test passed when it should of failed'))
        .catch((err) => {
          // Assert
          chai.expect(requestMethodStub.callCount).to.eql(0);
          chai.expect(err.message).to.eql('test error');
        });
    });

    it('Returns value from custom error handler when write errors and custom error handler', () => {
      // Arrange
      const errHandler = sinon.stub().rejects(new Error('fooBar'));
      const obj = bunyanLogstashHttp.createLoggerStream({
        loggingEndpoint: 'http://127.0.0.1:8080',
        level: 'debug',
        customFormatter: () => { throw new Error('test error'); },
        error: errHandler,
      });
      const { requestMethodStub } = stubRequest(http);
      const logRecord = { msg: 'test' };

      // Act
      return obj.write(logRecord)
        .then(() => new chai.AssertionError('Test passed when it should of failed'))
        .catch((err) => {
          // Assert
          chai.expect(requestMethodStub.callCount).to.eql(0);
          chai.expect(errHandler.callCount).to.eql(1);
          chai.expect(err.message).to.eql('fooBar');
        });
    });

    it('Write request fails and writes to stderr', () => {
      // Arrange
      const obj = bunyanLogstashHttp.createLoggerStream({
        loggingEndpoint: 'http://127.0.0.1:8080',
        level: 'debug',
      });

      const { requestMethodStub, requestStub } = stubFailingRequest(http);
      const logRecord = createBunyanLogRecord({ msg: 'test' });
      const writeStub = sinon.stub(process.stderr, 'write');

      // Act
      return obj.write(logRecord).catch(() => {
        const expectedLog = '{"@timestamp":"2020-01-01T12:00:00.000Z","logLevel":"INFO","message":"test","name":"from test","hostname":"test host","pid":-1,"level":30,"time":"2020-01-01T12:00:00.000Z","v":0}';

        // Assert
        chai.expect(requestMethodStub.callCount).to.eql(1);
        chai.expect(requestStub.write.callCount).to.eql(1);
        chai.expect(requestStub.write.firstCall.args[0]).to.eql(expectedLog);
        chai.expect(requestStub.end.callCount).to.eql(1);
        chai.expect(writeStub.callCount).to.eql(1);
      });
    });

    it('Rejects when 400+ status code returned', () => {
      // Arrange
      const obj = bunyanLogstashHttp.createLoggerStream({
        loggingEndpoint: 'http://127.0.0.1:8080',
        level: 'debug',
      });

      const { requestMethodStub, requestStub } = stubRequest(http, { statusCode: 400 });
      const logRecord = createBunyanLogRecord({ msg: 'test' });

      // Act
      return obj.write(logRecord).catch(() => {
        const expectedLog = '{"@timestamp":"2020-01-01T12:00:00.000Z","logLevel":"INFO","message":"test","name":"from test","hostname":"test host","pid":-1,"level":30,"time":"2020-01-01T12:00:00.000Z","v":0}';

        // Assert
        chai.expect(requestMethodStub.callCount).to.eql(1);
        chai.expect(requestStub.write.callCount).to.eql(1);
        chai.expect(requestStub.write.firstCall.args[0]).to.eql(expectedLog);
        chai.expect(requestStub.end.callCount).to.eql(1);
      });
    });
  });
});
