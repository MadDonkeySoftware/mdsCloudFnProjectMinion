/* eslint-disable no-unused-expressions */
const sinon = require('sinon');
const chai = require('chai');

const fnProject = require('./index');

describe('src/fnProviders/index', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('getProviderForRuntime', () => {
    it('returns node provider', () => {
      // Act
      const provider = fnProject.getProviderForRuntime('node');

      // Assert
      chai.expect(provider).is.not.undefined;
    });

    it('returns provider that has buildAppName', () => {
      // Act
      const appName = fnProject.getProviderForRuntime('node').buildAppName({ account: '123' });

      // Assert
      chai.expect(appName).equals('mdsFn-123');
    });

    it('throws error when provider is unknown', () => chai.expect(
      () => fnProject.getProviderForRuntime('does not exist'),
    ).to.throw('Runtime "does not exist" not understood.'));
  });
});
