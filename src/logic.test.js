/* eslint-disable no-unused-expressions */

const chai = require('chai');
const sinon = require('sinon');
const chaiAsPromised = require('chai-as-promised');

const mds = require('@maddonkeysoftware/mds-cloud-sdk-node');
const fs = require('fs');
const shelljs = require('shelljs');
const unzipper = require('unzipper');
const dns = require('dns');

const globals = require('./globals');
const logic = require('./logic');
const repo = require('./repo');
const helpers = require('./helpers');
const fnProviders = require('./fnProviders');

chai.use(chaiAsPromised);

describe('src/logic', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('createTempDirectory', () => {
    it('returns a new temp directory', () => {
      // Arrange
      sinon.stub(fs, 'mkdtempSync').returns('/tmp/abcdef');

      // Act
      return logic.createTempDirectory().then((temp) => {
        // Assert
        chai.expect(temp).to.equal('/tmp/abcdef');
      });
    });
  });

  describe('cleanupTempDirectory', () => {
    it('Passes through to shell to recursively cleanup directory', () => {
      // Arrange
      sinon.stub(shelljs, 'exec').withArgs('/tmp/abcdef').resolves();

      // Act
      return logic.cleanupTempDirectory('/tmp/abcdef').then(() => {
        chai.expect(shelljs.exec.callCount).to.be.equal(1);
      });
    });
  });

  describe('findEntrypointForNode', () => {
    it('when package.json exists returns parent directory', () => {
      // Arrange
      sinon.stub(fs, 'readdir').callsFake((path, cb) => {
        cb(undefined, ['file1', 'dir1', 'package.json']);
      });

      // Act
      return logic.findEntrypointForNode('/test/dir')
        .then((entryPoint) => {
          // Assert
          chai.expect(entryPoint).to.equal('/test/dir');
        });
    });

    it('when no files in directory rejects', () => {
      // Arrange
      sinon.stub(fs, 'readdir').callsFake((path, cb) => {
        cb(undefined, []);
      });

      // Act
      return chai.expect(logic.findEntrypointForNode('/test/dir')).to.eventually.be.rejected;
    });

    it('when no package.json returns first sub directory', () => {
      // TODO: Figure out if this is a valid use case
      // Arrange
      sinon.stub(fs, 'readdir').callsFake((path, cb) => {
        cb(undefined, ['dir1', 'file1', 'file2']);
      });

      // Act
      return logic.findEntrypointForNode('/test/dir')
        .then((entryPoint) => {
          // Assert
          chai.expect(entryPoint).to.equal('/test/dir/dir1');
        });
    });
  });

  describe('findEntrypointForRuntime', () => {
    it('For node runtime calls findEntrypointForNode with proper arg', () => {
      // Arrange
      sinon.stub(logic, 'findEntrypointForNode').withArgs('/test/dir').resolves('nodeEntrypoint');

      // Act & Assert
      chai.expect(logic.findEntrypointForRuntime('node', '/test/dir'))
        .to.eventually.equal('nodeEntrypoint');
    });

    it('For unknown runtime rejects with message', () => {
      // Act & Assert
      chai.expect(logic.findEntrypointForRuntime('WAT', '/test/dir'))
        .to.eventually.be.rejectedWith('Runtime "WAT" not understood.');
    });
  });

  describe('extractSourceToPath', () => {
    const metadata = {
      localPath: '/test/dir',
      runtime: 'testRuntime',
      container: {
        name: 'testContainer',
        path: 'testContainerPath',
      },
    };

    it('when successful extracts source and returns path to source', () => {
      // Arrange
      const fsStream = {};
      const fsStreamOnData = {};
      fsStream.pipe = sinon.stub().returns(fsStream);
      fsStream.on = sinon.stub().callsFake((label, cb) => {
        fsStreamOnData[label] = cb;
        return fsStream;
      });

      sinon.stub(mds, 'getFileServiceClient').returns({
        downloadFile: sinon.stub().withArgs('/test/dir/testContainerPath').resolves(),
      });
      sinon.stub(fs, 'createReadStream').withArgs('/test/dir/testContainerPath').returns(fsStream);
      sinon.stub(fs, 'unlink').callsFake((localPath, cb) => {
        if (localPath === '/test/dir/testContainerPath') globals.delay(1).then(() => cb());
      });
      sinon.stub(logic, 'findEntrypointForRuntime').resolves('/test/entry/path');
      sinon.stub(unzipper, 'Extract').returns(undefined);

      // Act
      globals.delay(1).then(() => {
        fsStreamOnData.close();
      });
      return chai.expect(logic.extractSourceToPath(metadata)).to.eventually.be.fulfilled
        .then((path) => {
          chai.expect(path).to.equal('/test/entry/path');
        });
    });

    it('when fs error rejects with error', () => {
      // Arrange
      const fsStream = {};
      const fsStreamOnData = {};
      fsStream.pipe = sinon.stub().returns(fsStream);
      fsStream.on = sinon.stub().callsFake((label, cb) => {
        fsStreamOnData[label] = cb;
        return fsStream;
      });

      sinon.stub(mds, 'getFileServiceClient').returns({
        downloadFile: sinon.stub().withArgs('/test/dir/testContainerPath').resolves(),
      });
      sinon.stub(fs, 'createReadStream').withArgs('/test/dir/testContainerPath').returns(fsStream);
      sinon.stub(unzipper, 'Extract').returns(undefined);

      // Act
      globals.delay(1).then(() => {
        fsStreamOnData.error(new Error('test error'));
      });
      return chai.expect(logic.extractSourceToPath(metadata)).to.eventually.be
        .rejectedWith('test error');
    });

    it('when findEntryPontForRuntime errors rejects with error', () => {
      // Arrange
      const fsStream = {};
      const fsStreamOnData = {};
      fsStream.pipe = sinon.stub().returns(fsStream);
      fsStream.on = sinon.stub().callsFake((label, cb) => {
        fsStreamOnData[label] = cb;
        return fsStream;
      });

      sinon.stub(mds, 'getFileServiceClient').returns({
        downloadFile: sinon.stub().withArgs('/test/dir/testContainerPath').resolves(),
      });
      sinon.stub(fs, 'createReadStream').withArgs('/test/dir/testContainerPath').returns(fsStream);
      sinon.stub(fs, 'unlink').callsFake((localPath, cb) => {
        if (localPath === '/test/dir/testContainerPath') globals.delay(1).then(() => cb());
      });
      sinon.stub(logic, 'findEntrypointForRuntime').rejects(new Error('test error'));
      sinon.stub(unzipper, 'Extract').returns(undefined);

      // Act
      globals.delay(1).then(() => {
        fsStreamOnData.close();
      });
      return chai.expect(logic.extractSourceToPath(metadata)).to.eventually.be
        .rejectedWith('test error');
    });

    it('when fs download then chain errors rejects with error', () => {
      // Arrange
      const fsStream = {};
      fsStream.pipe = sinon.stub().returns(fsStream);
      fsStream.on = sinon.stub().returns(fsStream);

      sinon.stub(mds, 'getFileServiceClient').returns({
        downloadFile: sinon.stub().withArgs('/test/dir/testContainerPath').rejects(new Error('test error')),
      });

      // Act
      return chai.expect(logic.extractSourceToPath(metadata)).to.eventually.be
        .rejectedWith('test error');
    });

    it('when error thrown rejects with error', () => {
      // Arrange
      sinon.stub(mds, 'getFileServiceClient').throws(new Error('test error'));

      // Act & Assert
      return chai.expect(logic.extractSourceToPath(metadata)).to.eventually.be
        .rejectedWith('test error');
    });
  });

  describe('prepSourceForContainerBuild', () => {
    const localPath = '/test/dir';
    const metadata = {
      runtime: 'testRuntime',
      entryPoint: 'index:main',
      container: {
        name: 'testContainer',
        path: 'testContainerPath',
      },
    };

    it('when no errors occur resolves', () => {
      // Arrange
      sinon.stub(shelljs, 'exec').callsFake((cmd, opts, cb) => {
        if (cmd === 'npm install --save @fnproject/fdk') globals.delay(1).then(() => cb(0, '', ''));
      });
      sinon.stub(fs, 'writeFile').callsFake((fp, data, cb) => {
        if (fp === '/test/dir/mdsEntry.js') globals.delay(1).then(() => cb());
        if (fp === '/test/dir/MdsDockerfile') globals.delay(1).then(() => cb());
      });

      // Act & Assert
      return chai.expect(logic.prepSourceForContainerBuild(localPath, metadata))
        .to.eventually.be.fulfilled;
    });

    it('when FDK fails to install rejects', () => {
      // Arrange
      sinon.stub(shelljs, 'exec').callsFake((cmd, opts, cb) => {
        if (cmd === 'npm install --save @fnproject/fdk') globals.delay(1).then(() => cb(-1, 'out', 'err'));
      });

      // Act & Assert
      return chai.expect(logic.prepSourceForContainerBuild(localPath, metadata))
        .to.eventually.be.rejected;
    });

    it('when writing entry file errors occur rejects with error', () => {
      // Arrange
      sinon.stub(shelljs, 'exec').callsFake((cmd, opts, cb) => {
        if (cmd === 'npm install --save @fnproject/fdk') globals.delay(1).then(() => cb(0, '', ''));
      });
      sinon.stub(fs, 'writeFile').callsFake((fp, data, cb) => {
        if (fp === '/test/dir/mdsEntry.js') globals.delay(1).then(() => cb(new Error('test error')));
      });

      // Act & Assert
      return chai.expect(logic.prepSourceForContainerBuild(localPath, metadata))
        .to.eventually.be.rejectedWith('test error');
    });

    it('when writing docker file errors occur rejects with error', () => {
      // Arrange
      sinon.stub(shelljs, 'exec').callsFake((cmd, opts, cb) => {
        if (cmd === 'npm install --save @fnproject/fdk') globals.delay(1).then(() => cb(0, '', ''));
      });
      sinon.stub(fs, 'writeFile').callsFake((fp, data, cb) => {
        if (fp === '/test/dir/mdsEntry.js') globals.delay(1).then(() => cb());
        if (fp === '/test/dir/MdsDockerfile') globals.delay(1).then(() => cb(new Error('test error')));
      });

      // Act & Assert
      return chai.expect(logic.prepSourceForContainerBuild(localPath, metadata))
        .to.eventually.be.rejectedWith('test error');
    });
  });

  describe('buildContainer', () => {
    const localPath = '/test/dir';
    const metadata = {
      accountId: 1,
      version: 2,
      name: 'testFunc',
      runtime: 'testRuntime',
      entryPoint: 'index:main',
      container: {
        name: 'testContainer',
        path: 'testContainerPath',
      },
    };

    describe('resolves with container metadata', () => {
      it('when no container host provided', () => {
        // Arrange
        sinon.stub(helpers, 'getEnvVar').withArgs('MDS_FN_CONTAINER_HOST').returns(undefined);
        sinon.stub(shelljs, 'exec').callsFake((cmd, opts, cb) => {
          if (cmd === 'docker build -t mds-sf-1/testfunc:2 -f MdsDockerfile .') {
            globals.delay(1).then(() => cb(0, '', ''));
          }
        });

        // Act
        return chai.expect(logic.buildContainer(localPath, metadata))
          .to.eventually.be.fulfilled.then((data) => {
            chai.expect(data).to.deep.equal({
              name: 'testFunc',
              tagPrefix: 'mds-sf-1/testfunc',
              tagVersion: 2,
            });
          });
      });

      it('when container host provided', () => {
        // Arrange
        sinon.stub(helpers, 'getEnvVar').withArgs('MDS_FN_CONTAINER_HOST').returns('123.123.123.123:5000');
        sinon.stub(shelljs, 'exec').callsFake((cmd, opts, cb) => {
          if (cmd === 'docker build -t 123.123.123.123:5000/mds-sf-1/testfunc:2 -f MdsDockerfile .') {
            globals.delay(1).then(() => cb(0, '', ''));
          }
        });

        // Act
        return chai.expect(logic.buildContainer(localPath, metadata))
          .to.eventually.be.fulfilled.then((data) => {
            chai.expect(data).to.deep.equal({
              name: 'testFunc',
              tagPrefix: '123.123.123.123:5000/mds-sf-1/testfunc',
              tagVersion: 2,
            });
          });
      });
    });

    it('rejects when docker build fails', () => {
      // Arrange
      sinon.stub(helpers, 'getEnvVar').withArgs('MDS_FN_CONTAINER_HOST').returns(undefined);
      sinon.stub(shelljs, 'exec').callsFake((cmd, opts, cb) => {
        if (cmd === 'docker build -t mds-sf-1/testfunc:2 -f MdsDockerfile .') {
          globals.delay(1).then(() => cb(-1, 'out', 'err'));
        }
        if (cmd === 'cat /test/dir/package.json') globals.delay(1).then(() => cb(0, '', ''));
      });

      // Act
      return chai.expect(logic.buildContainer(localPath, metadata))
        .to.eventually.be.rejectedWith('Failed to build docker image.');
    });
  });

  describe('pushContainerToRegistry', () => {
    const metadata = {
      tagPrefix: 'testTagPrefix',
      tagVersion: 1,
    };

    it('resolves after command executes', () => {
      // Arrange
      sinon.stub(shelljs, 'exec').callsFake((cmd, opts, cb) => {
        if (cmd === 'docker push testTagPrefix:1') globals.delay(1).then(() => cb(0, '', ''));
      });

      // Act
      return chai.expect(logic.pushContainerToRegistry(metadata))
        .to.eventually.be.fulfilled;
    });
  });

  describe('removeContainerLocally', () => {
    const metadata = {
      tagPrefix: 'testTagPrefix',
      tagVersion: 1,
    };

    it('resolves after command executes', () => {
      // Arrange
      sinon.stub(shelljs, 'exec').callsFake((cmd, opts, cb) => {
        if (cmd === 'docker rmi testTagPrefix:1') globals.delay(1).then(() => cb(0, '', ''));
      });

      // Act
      return chai.expect(logic.removeContainerLocally(metadata))
        .to.eventually.be.fulfilled;
    });
  });

  describe('createFuncInProvider', () => {
    const funcMeta = {
      name: 'testFunc',
      runtime: 'testRuntime',
      providerAppId: 'testApp',
    };
    const containerMeta = {
      tagPrefix: 'testTagPrefix',
      tagVersion: 1,
    };

    it('resolves after command executes', () => {
      // Arrange
      const stubResponse = {
        status: 200,
        body: 'test body',
      };
      sinon.stub(fnProviders, 'getProviderForRuntime').withArgs('testRuntime').returns({
        createFunction: sinon.stub().withArgs('testFunc', 'testApp', 'testTagPrefix:1').resolves(stubResponse),
      });

      // Act
      return chai.expect(logic.createFuncInProvider(funcMeta, containerMeta))
        .to.eventually.be.fulfilled;
    });
  });

  describe('updateFuncInProvider', () => {
    const funcMeta = {
      name: 'testFunc',
      runtime: 'testRuntime',
      providerAppId: 'testApp',
    };
    const containerMeta = {
      tagPrefix: 'testTagPrefix',
      tagVersion: 1,
    };

    it('resolves after command executes', () => {
      // Arrange
      const stubResponse = {
        status: 200,
        body: 'test body',
      };
      sinon.stub(fnProviders, 'getProviderForRuntime').withArgs('testRuntime').returns({
        updateFunction: sinon.stub().withArgs('testFunc', 'testApp', 'testTagPrefix:1').resolves(stubResponse),
      });

      // Act
      return chai.expect(logic.updateFuncInProvider(funcMeta, containerMeta))
        .to.eventually.be.fulfilled;
    });
  });

  describe('buildFunction', () => {
    const eventData = {
      functionId: 'testFuncId',
    };

    describe('function does not exist in provider', () => {
      it('when no container host provided', () => {
        // Arrange
        const dbFuncMetadata = {
          runtime: 'testRuntime',
        };
        const containerMeta = {
        };
        const providerMeta = {
          annotations: {
            'fnproject.io/fn/invokeEndpoint': 'http://127.0.0.1/invokeUrl',
          },
        };

        sinon.stub(logic, 'createTempDirectory').resolves('/tmp/abcdef');
        sinon.stub(logic, 'extractSourceToPath').resolves('/tmp/abcdef');
        sinon.stub(logic, 'prepSourceForContainerBuild').withArgs('/tmp/abcdef', dbFuncMetadata).resolves();
        sinon.stub(logic, 'buildContainer').withArgs('/tmp/abcdef', dbFuncMetadata).resolves(containerMeta);
        sinon.stub(logic, 'pushContainerToRegistry').withArgs(containerMeta).resolves();
        sinon.stub(logic, 'removeContainerLocally').withArgs(containerMeta).resolves();
        sinon.stub(logic, 'createFuncInProvider').withArgs(dbFuncMetadata, containerMeta).resolves(providerMeta);
        sinon.stub(logic, 'cleanupTempDirectory').withArgs('/tmp/abcdef').resolves();
        const funcColStub = {
          findOne: sinon.stub()
            .withArgs(sinon.match({ id: eventData.functionId })).resolves(dbFuncMetadata),
          updateOne: sinon.stub().resolves(),
        };
        sinon.stub(repo, 'getDatabase').resolves({
          close: () => Promise.resolve(),
          getCollection: () => funcColStub,
        });

        // Act
        return chai.expect(logic.buildFunction(eventData)).to.eventually.be.fulfilled;
      });

      it('when container host provided', () => {
        // Arrange
        const dbFuncMetadata = {
          runtime: 'testRuntime',
        };
        const containerMeta = {
        };
        const providerMeta = {
          annotations: {
            'fnproject.io/fn/invokeEndpoint': 'http://127.0.0.1/invokeUrl',
          },
        };

        sinon.stub(helpers, 'getEnvVar').withArgs('MDS_FN_FNPROJECT_URL').returns('http://127.0.0.1:1234');
        sinon.stub(logic, 'createTempDirectory').resolves('/tmp/abcdef');
        sinon.stub(logic, 'extractSourceToPath').resolves('/tmp/abcdef');
        sinon.stub(logic, 'prepSourceForContainerBuild').withArgs('/tmp/abcdef', dbFuncMetadata).resolves();
        sinon.stub(logic, 'buildContainer').withArgs('/tmp/abcdef', dbFuncMetadata).resolves(containerMeta);
        sinon.stub(logic, 'pushContainerToRegistry').withArgs(containerMeta).resolves();
        sinon.stub(logic, 'removeContainerLocally').withArgs(containerMeta).resolves();
        sinon.stub(logic, 'createFuncInProvider').withArgs(dbFuncMetadata, containerMeta).resolves(providerMeta);
        sinon.stub(logic, 'cleanupTempDirectory').withArgs('/tmp/abcdef').resolves();
        const funcColStub = {
          findOne: sinon.stub()
            .withArgs(sinon.match({ id: eventData.functionId })).resolves(dbFuncMetadata),
          updateOne: sinon.stub().resolves(),
        };
        sinon.stub(repo, 'getDatabase').resolves({
          close: () => Promise.resolve(),
          getCollection: () => funcColStub,
        });

        // Act
        return chai.expect(logic.buildFunction(eventData)).to.eventually.be.fulfilled;
      });
    });

    it('Updates existing function', () => {
      // Arrange
      const dbFuncMetadata = {
        runtime: 'testRuntime',
        funcId: 'testFuncId',
      };
      const containerMeta = {
      };

      sinon.stub(logic, 'createTempDirectory').resolves('/tmp/abcdef');
      sinon.stub(logic, 'extractSourceToPath').resolves('/tmp/abcdef');
      sinon.stub(logic, 'prepSourceForContainerBuild').withArgs('/tmp/abcdef', dbFuncMetadata).resolves();
      sinon.stub(logic, 'buildContainer').withArgs('/tmp/abcdef', dbFuncMetadata).resolves(containerMeta);
      sinon.stub(logic, 'pushContainerToRegistry').withArgs(containerMeta).resolves();
      sinon.stub(logic, 'removeContainerLocally').withArgs(containerMeta).resolves();
      sinon.stub(logic, 'updateFuncInProvider').withArgs(dbFuncMetadata, containerMeta).resolves();
      sinon.stub(logic, 'cleanupTempDirectory').withArgs('/tmp/abcdef').resolves();
      const funcColStub = {
        findOne: sinon.stub()
          .withArgs(sinon.match({ id: eventData.functionId })).resolves(dbFuncMetadata),
        updateOne: sinon.stub().resolves(),
      };
      sinon.stub(repo, 'getDatabase').resolves({
        close: () => Promise.resolve(),
        getCollection: () => funcColStub,
      });

      // Act
      return chai.expect(logic.buildFunction(eventData)).to.eventually.be.fulfilled;
    });

    it('logs and throws when error occurs', () => {
      const fakeLogger = {
        debug: sinon.stub(),
        trace: sinon.stub(),
        warn: sinon.stub(),
      };
      sinon.stub(globals, 'getLogger').returns(fakeLogger);
      sinon.stub(logic, 'createTempDirectory').resolves('/tmp/abcdef');
      sinon.stub(logic, 'cleanupTempDirectory').withArgs('/tmp/abcdef').resolves();

      sinon.stub(repo, 'getDatabase').resolves({
        close: () => Promise.resolve(),
        getCollection: () => { throw new Error('test error'); },
      });

      // Act
      return chai.expect(logic.buildFunction(eventData)).to.eventually.be.rejectedWith('test error')
        .then(() => {
          chai.expect(fakeLogger.warn.callCount).to.equal(1);
        });
    });
  });

  describe('getContainerHost', () => {
    beforeEach(() => {
      logic.clearContainerHost();
    });

    it('resolves with port 80 when no port specified', () => {
      // Arrange
      const getEnvVarStub = sinon.stub(helpers, 'getEnvVar');
      getEnvVarStub.withArgs('MDS_FN_CONTAINER_HOST').returns('1.2.3.4');

      // Act
      return logic.getContainerHost().then((result1) => {
        // Assert
        chai.expect(result1).to.equal('1.2.3.4:80/');
      });
    });

    it('resolves cached container host when called multiple times', () => {
      // Arrange
      const getEnvVarStub = sinon.stub(helpers, 'getEnvVar');
      getEnvVarStub.withArgs('MDS_FN_CONTAINER_HOST').returns('1.2.3.4:5678');

      // Act
      return logic.getContainerHost().then((result1) => logic.getContainerHost().then((result2) => {
        // Assert
        chai.expect(result1).to.equal('1.2.3.4:5678/');
        chai.expect(result2).to.equal('1.2.3.4:5678/');
        chai.expect(getEnvVarStub.callCount).to.equal(1);
      }));
    });

    it('resolves ip address of host name when dns name used in place of IP address', () => {
      // Arrange
      const getEnvVarStub = sinon.stub(helpers, 'getEnvVar');
      getEnvVarStub.withArgs('MDS_FN_CONTAINER_HOST').returns('someHost:5678');
      sinon.stub(dns, 'lookup').callsFake((hn, cb) => cb(undefined, { address: '1.2.3.4' }));

      // Act
      return logic.getContainerHost().then((result1) => {
        // Assert
        chai.expect(result1).to.equal('1.2.3.4:5678/');
      });
    });
  });
});
