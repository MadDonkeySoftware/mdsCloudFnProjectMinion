/* eslint-disable no-unused-expressions */

const _ = require('lodash');
const chai = require('chai');
const sinon = require('sinon');

const helpers = require('./helpers');

describe('src/helpers', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('getEnvVar', () => {
    it('Reads env vars', () => {
      const keys = ['NODE_ENV', 'NONEXISTENT'];
      _.map(keys, (k) => chai.expect(helpers.getEnvVar(k)).to.equal(process.env[k]));
    });
  });
});
