const sinon = require('sinon');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');

const fnProject = require('./fnProject');
const globals = require('../globals');

chai.use(chaiAsPromised);

describe('src/fnProviders/fnProject', () => {
  const fnProjectApi = nock('http://127.0.0.1:8080');

  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
  });

  describe('NAME', () => {
    it('is static value fnProject', () => {
      chai.expect(fnProject.NAME).to.equal('fnProject');
    });
  });

  describe('getFnProjectUrl', () => {
    it('when no environment provided returns localhost url on port 8080', () => {
      chai.expect(fnProject.getFnProjectUrl()).to.equal('http://127.0.0.1:8080');
    });

    it('when environment does not contain key returns localhost url on port 8080', () => {
      chai.expect(fnProject.getFnProjectUrl({})).to.equal('http://127.0.0.1:8080');
    });

    it('when environment does contain key returns localhost url on port 8080', () => {
      chai.expect(fnProject.getFnProjectUrl({ MDS_FN_FNPROJECT_URL: 'foobar' })).to.equal('foobar');
    });
  });

  describe('createApp', () => {
    it('when successful returns new app id', () => {
      // Arrange
      const name = 'testApp';
      fnProjectApi.post('/v2/apps', { name })
        .reply(200, { id: 12345 });

      // Act
      return chai.expect(fnProject.createApp(name)).to.be.fulfilled.and.then((id) => {
        // Assert
        chai.expect(id).to.equal(12345);
      });
    });

    it('when fails returns undefined', () => {
      // Arrange
      const name = 'testApp';
      fnProjectApi.post('/v2/apps', { name })
        .reply(500);

      // Act
      return chai.expect(fnProject.createApp(name)).to.be.fulfilled.and.then((id) => {
        // Assert
        chai.expect(id).to.equal(undefined);
      });
    });
  });

  describe('findAppIdByName', () => {
    describe('with single page of data', () => {
      it('Returns the app id when found', () => {
        // Arrange
        const name = 'testApp';
        fnProjectApi.get('/v2/apps')
          .reply(200, { items: [{ id: 12345, name }] });

        // Act
        return chai.expect(fnProject.findAppIdByName(name)).to.be.fulfilled.and.then((id) => {
          // Assert
          chai.expect(id).to.equal(12345);
        });
      });

      it('Returns undefined app id when not found', () => {
        // Arrange
        const name = 'testApp';
        fnProjectApi.get('/v2/apps')
          .reply(200, { items: [] });

        // Act
        return chai.expect(fnProject.findAppIdByName(name)).to.be.fulfilled.and.then((id) => {
          // Assert
          chai.expect(id).to.equal(undefined);
        });
      });
    });

    describe('with multiple pages of data', () => {
      it('Returns the app id when found', () => {
        // Arrange
        const name = 'testApp';
        fnProjectApi.get('/v2/apps')
          .reply(200, { items: [{ id: 1, name: 'test' }], next_cursor: 'a' });
        fnProjectApi.get('/v2/apps?cursor=a')
          .reply(200, { items: [{ id: 12345, name }] });

        // Act
        return chai.expect(fnProject.findAppIdByName(name)).to.be.fulfilled.and.then((id) => {
          // Assert
          chai.expect(id).to.equal(12345);
        });
      });

      it('Multiple pages can handle errors gracefully', () => {
        // Arrange
        const name = 'testApp';
        fnProjectApi.get('/v2/apps')
          .reply(200, { items: [{ id: 1, name: 'test' }], next_cursor: 'a' });
        fnProjectApi.get('/v2/apps?cursor=a').reply(500);
        fnProjectApi.get('/v2/apps?cursor=a')
          .reply(200, { items: [{ id: 12345, name }] });
        sinon.stub(globals, 'delay').resolves();

        // Act
        return chai.expect(fnProject.findAppIdByName(name)).to.be.fulfilled.and.then((id) => {
          // Assert
          chai.expect(id).to.equal(12345);
        });
      });

      it('Throws error when multiple errors encountered from API', () => {
        // Arrange
        const name = 'testApp';
        fnProjectApi.get('/v2/apps')
          .reply(200, { items: [{ id: 1, name: 'test' }], next_cursor: 'a' });
        fnProjectApi.get('/v2/apps?cursor=a').reply(500);
        fnProjectApi.get('/v2/apps?cursor=a').reply(500);
        fnProjectApi.get('/v2/apps?cursor=a').reply(500);
        fnProjectApi.get('/v2/apps?cursor=a').reply(500);
        sinon.stub(globals, 'delay').resolves();

        // Act
        return chai.expect(fnProject.findAppIdByName(name)).to.be.rejected.and.then((err) => {
          // Assert
          chai.expect(err.message).to.equal('Could not get application list from provider');
        });
      });
    });
  });

  describe('createFunction', () => {
    it('when successful returns new function id', () => {
      // Arrange
      const name = 'testApp';
      const appId = 'testAppId';
      const image = 'testImage';
      fnProjectApi.post('/v2/fns', { name, app_id: appId, image })
        .reply(200, { id: 12345 });

      // Act
      return chai.expect(fnProject.createFunction(name, appId, image)).to.be.fulfilled.and
        .then((id) => {
          // Assert
          chai.expect(id).to.deep.equal({ id: 12345 });
        });
    });

    it('when fails returns undefined', () => {
      // Arrange
      const name = 'testApp';
      const appId = 'testAppId';
      const image = 'testImage';
      fnProjectApi.post('/v2/fns', { name, app_id: appId, image })
        .reply(500);

      // Act
      return chai.expect(fnProject.createFunction(name, appId, image)).to.be.fulfilled.and
        .then((id) => {
          // Assert
          chai.expect(id).to.equal(undefined);
        });
    });
  });

  describe('updateFunction', () => {
    it('when successful returns new function id', () => {
      // Arrange
      const funcId = 'testFunc';
      const appId = 'testAppId';
      const image = 'testImage';
      fnProjectApi.put(`/v2/fns/${funcId}`, { image })
        .reply(200, { id: 12345 });

      // Act
      return chai.expect(fnProject.updateFunction(funcId, appId, image)).to.be.fulfilled.and
        .then((id) => {
          // Assert
          chai.expect(id).to.deep.equal({ id: 12345 });
        });
    });

    it('when fails returns undefined', () => {
      // Arrange
      const funcId = 'testFunc';
      const appId = 'testAppId';
      const image = 'testImage';
      fnProjectApi.put(`/v2/fns/${funcId}`, { image })
        .reply(500);

      // Act
      return chai.expect(fnProject.updateFunction(funcId, appId, image)).to.be.fulfilled.and
        .then((id) => {
          // Assert
          chai.expect(id).to.equal(undefined);
        });
    });
  });
});
