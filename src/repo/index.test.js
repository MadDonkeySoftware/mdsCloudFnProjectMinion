/* eslint-disable no-unused-expressions */
const sinon = require('sinon');
const chai = require('chai');

const MongoClient = require('mongodb');
const repo = require('.');

describe('src/handlers/index', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('getDatabase', () => {
    it('using defaults returns proper connection', () => {
      // Arrange
      const fakeConnection = {
        db: sinon.stub(),
        close: sinon.stub(),
      };
      const fakeDatabase = {
        collection: sinon.stub(),
      };
      const fakeCollection = {};
      fakeConnection.db.returns(fakeDatabase);
      fakeDatabase.collection.returns(fakeCollection);
      const connectStub = sinon.stub(MongoClient, 'connect').resolves(fakeConnection);

      // Act
      repo.getDatabase().then((db) => {
        // Act part 2
        const col = db.getCollection('foo');
        db.close();

        // Assert
        chai.expect(col).to.equal(fakeCollection);
        const connectCalls = connectStub.getCalls();
        chai.expect(connectCalls.length).to.equal(1);
        chai.expect(connectCalls[0].args[0]).to.equal('mongodb://127.0.0.1:27017');
        const dbCalls = fakeConnection.db.getCalls();
        chai.expect(dbCalls.length).to.equal(1);
        chai.expect(dbCalls[0].args[0]).to.equal('mdsCloudServerlessFunctions');
        chai.expect(fakeConnection.close.callCount).to.equal(1);
      });
    });

    it('using defaults returns proper connection', () => {
      // Arrange
      const fakeConnection = {
        db: sinon.stub(),
        close: sinon.stub(),
      };
      const fakeDatabase = {
        collection: sinon.stub(),
      };
      const fakeCollection = {};
      fakeConnection.db.returns(fakeDatabase);
      fakeDatabase.collection.returns(fakeCollection);
      const connectStub = sinon.stub(MongoClient, 'connect').resolves(fakeConnection);

      // Act
      repo.getDatabase('some-url').then((db) => {
        // Act part 2
        const col = db.getCollection('foo');
        db.close();

        // Assert
        chai.expect(col).to.equal(fakeCollection);
        const connectCalls = connectStub.getCalls();
        chai.expect(connectCalls.length).to.equal(1);
        chai.expect(connectCalls[0].args[0]).to.equal('some-url');
        const dbCalls = fakeConnection.db.getCalls();
        chai.expect(dbCalls.length).to.equal(1);
        chai.expect(dbCalls[0].args[0]).to.equal('mdsCloudServerlessFunctions');
        chai.expect(fakeConnection.close.callCount).to.equal(1);
      });
    });
  });

  describe('getMongoUrl', () => {
    it('returns value for key MDS_FN_MONGO_URL when exists', () => {
      // Arrange
      const input = {
        MDS_FN_MONGO_URL: 'some-value',
      };

      // Act
      const val = repo.getMongoUrl(input);

      // Assert
      chai.expect(val).to.equal(input.MDS_FN_MONGO_URL);
    });

    it('returns default value when key MDS_FN_MONGO_URL does not exist', () => {
      // Act
      const val = repo.getMongoUrl();

      // Assert
      chai.expect(val).to.equal('mongodb://127.0.0.1:27017');
    });
  });

  describe('getMongoDbName', () => {
    it('returns value for key MDS_MONGO_URL when exists', () => {
      // Arrange
      const input = {
        MDS_FN_MONGO_DB_NAME: 'some-value',
      };

      // Act
      const val = repo.getMongoDbName(input);

      // Assert
      chai.expect(val).to.equal(input.MDS_FN_MONGO_DB_NAME);
    });

    it('returns default value when key MDS_FN_MONGO_DB_NAME does not exist', () => {
      // Act
      const val = repo.getMongoDbName();

      // Assert
      chai.expect(val).to.equal('mdsCloudServerlessFunctions');
    });
  });
});
