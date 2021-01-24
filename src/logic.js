const _ = require('lodash');
const mds = require('@maddonkeysoftware/mds-cloud-sdk-node');
const dns = require('dns');
const fs = require('fs');
const os = require('os');
const path = require('path');
const unzipper = require('unzipper');
const shelljs = require('shelljs');
const url = require('url');
const util = require('util');

const repo = require('./repo');
const globals = require('./globals');
const helpers = require('./helpers');
const fnProvider = require('./fnProviders');
const entryPointTemplate = require('../templates/fnProjectEntryPoint');
const dockerfileTemplate = require('../templates/fnProjectDockerfile');

/* TODO: Update to utilize self pattern
var self = module.exports = {
  foo: async(i) => Promise.resolve(i),
  bar: async(i) => self.foo(i).then(j => i + j),
};
*/

const createTempDirectory = async () => fs.mkdtempSync(`${os.tmpdir()}${path.sep}`);
const cleanupTempDirectory = async (dirPath) => shelljs.exec(`rm -rf ${dirPath}`);

const findEntrypointForNode = (dir) => new Promise((resolve, reject) => {
  fs.readdir(dir, (err, files) => {
    if (files.length === 0) {
      return reject();
    }

    if (files.indexOf('package.json') > -1) {
      return resolve(dir);
    }

    // TODO: Figure out if this is a valid use case or should be rejected
    return resolve(`${dir}${path.sep}${files[0]}`);
  });
});

const findEntrypointForRuntime = async (runtime, dir) => {
  switch (runtime.toUpperCase()) {
    case 'NODE':
      return module.exports.findEntrypointForNode(dir);
    default:
      throw new Error(`Runtime "${runtime}" not understood."`);
  }
};

const extractSourceToPath = (metadata) => new Promise((resolve, reject) => {
  const logger = globals.getLogger();
  const { localPath, runtime, container } = metadata;

  try {
    const fsClient = mds.getFileServiceClient();
    const containerZipPath = `${container.name}/${container.path}`;
    const localZipPath = `${localPath}${path.sep}${container.path}`;

    logger.trace({ containerZipPath, localPath }, 'downloading file');
    fsClient.downloadFile(containerZipPath, localPath).then(() => {
      logger.trace('download complete. Extracting to local.');
      fs.createReadStream(localZipPath)
        .pipe(unzipper.Extract({ path: `${localPath}` }))
        .on('error', (err) => {
          logger.warn({ err }, 'Error extracting zip.');
          reject(err);
        })
        .on('close', () => {
          logger.trace('Extract complete. Removing zip file.');
          fs.unlink(localZipPath, () => {
            logger.trace('Deleting zip file. Finding entry point.');
            module.exports.findEntrypointForRuntime(runtime, localPath)
              .then((rootPath) => { resolve(rootPath); })
              .catch((err) => reject(err));
          });
        });
    }).catch((err) => {
      logger.error({ err, metadata }, 'Failed to download file.');
      reject(err);
    });
  } catch (err) {
    reject(err);
  }
});

const prepSourceForContainerBuild = async (localPath, funcMetadata) => new Promise((res, rej) => {
  const logger = globals.getLogger();

  // Install provider entry point kit
  shelljs.exec('npm install --save @fnproject/fdk', { cwd: localPath, silent: true }, (retCode, sdtOut, stdErr) => {
    if (retCode === 0) {
      logger.debug({ localPath }, 'Installing FnProject fdk successful.');

      // Generate entry file
      const entryFilePath = `${localPath}${path.sep}mdsEntry.js`;
      const renderedTemplate = entryPointTemplate.generateTemplate(funcMetadata.entryPoint);
      fs.writeFile(entryFilePath, renderedTemplate, (err) => {
        if (err) {
          logger.error({ err, entryFilePath }, 'Writing entry point failed.');
          rej(err);
        } else {
          logger.debug({ entryFilePath }, 'Writing entry point successful.');

          // Generate Dockerfile
          const dockerFilePath = `${localPath}${path.sep}MdsDockerfile`;
          fs.writeFile(dockerFilePath, dockerfileTemplate.generateTemplate('mdsEntry.js'), (err2) => {
            if (err2) {
              logger.error({ err2, dockerFilePath }, 'Writing MdsDockerfile failed.');
              rej(err2);
            } else {
              logger.debug({ dockerFilePath }, 'Writing MdsDockerfile successful.');
              res();
            }
          });
        }
      });
    } else {
      logger.error({
        retCode, sdtOut, stdErr, localPath,
      }, 'Installing FDK failed.');
      rej();
    }
  });
});

// https://www.regextester.com/22
const isValidIpAddress = (ipAddress) => /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(ipAddress);

let resolvedContainerHost;

const clearContainerHost = () => {
  resolvedContainerHost = undefined;
};

const getContainerHost = async () => {
  if (resolvedContainerHost) return resolvedContainerHost;

  const containerHostEnv = helpers.getEnvVar('MDS_FN_CONTAINER_HOST');
  if (containerHostEnv) {
    const [host, port] = containerHostEnv.indexOf(':') > -1
      ? containerHostEnv.split(':')
      : [containerHostEnv, '80'];

    try {
      if (isValidIpAddress(host)) {
        resolvedContainerHost = `${host}:${port}/`;
        return resolvedContainerHost;
      }
      const lookup = util.promisify(dns.lookup);
      const discoveredIp = await lookup(host);
      resolvedContainerHost = `${discoveredIp.address}:${port}/`;
      return resolvedContainerHost;
    } catch (err) {
      const logger = globals.getLogger();
      logger.warn({ err }, 'Failed to find DNS resolution of container host.');
      resolvedContainerHost = `${containerHostEnv}/`;
      return resolvedContainerHost;
    }
  }
  return '';
};

const buildContainer = (localPath, funcMetadata) => new Promise((resolve, reject) => {
  getContainerHost().then((containerHost) => {
    const tagPrefix = `${containerHost}mds-sf-${funcMetadata.accountId}/${funcMetadata.name}`.toLowerCase();
    const tagVersion = funcMetadata.version;
    const cmd = `docker build -t ${tagPrefix}:${tagVersion} -f MdsDockerfile .`;
    shelljs.exec(cmd, { cwd: localPath, silent: true }, (retCode, sdtOut, stdErr) => {
      if (retCode === 0) {
        resolve({
          tagPrefix,
          tagVersion,
          name: funcMetadata.name,
        });
      } else {
        const logger = globals.getLogger();
        logger.error({ retCode, sdtOut, stdErr }, 'Failed to build docker image');
        shelljs.exec(`cat ${localPath}/package.json`, {}, (retCode2, stdOut2, stdErr2) => {
          logger.debug({ retCode: retCode2, stdOut: stdOut2, stdErr: stdErr2 }, 'Work directory output');
        });
        reject(new Error('Failed to build docker image.'));
      }
    });
  });
});

const pushContainerToRegistry = (metadata) => new Promise((resolve, reject) => {
  helpers.shellExecute(`docker push ${metadata.tagPrefix}:${metadata.tagVersion}`, { silent: true }).then(({ retCode, stdOut, stdErr }) => {
    if (retCode === 0) {
      resolve();
    } else {
      const logger = globals.getLogger();
      logger.error({ retCode, stdOut, stdErr }, 'Failed to push docker image');
      reject(new Error('Failed to push docker image.'));
    }
  });
});

const removeContainerLocally = (metadata) => new Promise((resolve) => {
  shelljs.exec(`docker rmi ${metadata.tagPrefix}:${metadata.tagVersion}`, { silent: true }, () => resolve());
});

const createFuncInProvider = async (funcMeta, containerMeta) => {
  const provider = fnProvider.getProviderForRuntime(funcMeta.runtime);
  const resp = await provider.createFunction(funcMeta.name, funcMeta.providerAppId, `${containerMeta.tagPrefix}:${containerMeta.tagVersion}`);
  return resp;
};

const updateFuncInProvider = async (funcMeta, containerMeta) => {
  const provider = fnProvider.getProviderForRuntime(funcMeta.runtime);
  const resp = await provider.updateFunction(funcMeta.funcId, funcMeta.providerAppId, `${containerMeta.tagPrefix}:${containerMeta.tagVersion}`);
  return resp;
};

const buildFunction = async (eventData) => {
  const logger = globals.getLogger();
  const dir = await module.exports.createTempDirectory();
  const database = await repo.getDatabase();
  try {
    logger.trace('Database connection established.');

    const funcCol = database.getCollection('functions');
    const metadata = await funcCol.findOne({ id: eventData.functionId });
    logger.debug({ metadata }, 'Function metadata fetch complete');

    const extractMeta = {
      localPath: dir,
      runtime: metadata.runtime,
      container: { name: eventData.sourceContainer, path: eventData.sourcePath },
    };

    logger.trace({ extractMeta }, 'Extracting source');
    const sourceRootPath = await module.exports.extractSourceToPath(extractMeta);
    logger.debug({ sourceRootPath }, 'Source extraction complete');

    await module.exports.prepSourceForContainerBuild(sourceRootPath, metadata);
    const containerMeta = await module.exports.buildContainer(sourceRootPath, metadata);
    logger.debug({ sourceRootPath, metadata, containerMeta }, 'Container build complete.');

    await module.exports.pushContainerToRegistry(containerMeta);
    await module.exports.removeContainerLocally(containerMeta);

    if (!metadata.funcId) {
      const providerMeta = await module.exports.createFuncInProvider(metadata, containerMeta);
      logger.debug({ providerMeta, metadata, containerMeta }, 'Provider entity created.');

      const metaInvokeUrl = url.parse(
        _.get(providerMeta, ['annotations', 'fnproject.io/fn/invokeEndpoint']),
      );
      const {
        protocol,
        port,
        hostname,
        path: invokePath,
      } = metaInvokeUrl;
      const host = helpers.getEnvVar('MDS_FN_FNPROJECT_URL')
        ? helpers.getEnvVar('MDS_FN_FNPROJECT_URL')
        : `${protocol}\\${hostname}:${port}`;
      const cleanedPath = invokePath.indexOf('/') !== 0 ? invokePath : invokePath.slice(1);
      const invokeUrl = `${host}/${cleanedPath}`;
      const funcId = _.get(providerMeta, ['id']);
      const mongoOptions = {
        writeConcern: {
          w: 'majority',
          j: true,
          wtimeout: 30000, // milliseconds
        },
      };
      await funcCol.updateOne({ id: metadata.id }, { $set: { invokeUrl, funcId } }, mongoOptions);
    } else {
      await module.exports.updateFuncInProvider(metadata, containerMeta);
      logger.debug({ metadata, containerMeta }, 'TODO: Provider entity updated.');
    }
  } catch (err) {
    logger.warn({ err }, 'Function build logic failed.');
    throw err;
  } finally {
    await database.close();
    await module.exports.cleanupTempDirectory(dir);
    logger.debug('Function build complete.');
  }
};

module.exports = {
  createTempDirectory,
  cleanupTempDirectory,
  findEntrypointForNode,
  findEntrypointForRuntime,
  extractSourceToPath,
  prepSourceForContainerBuild,
  buildContainer,
  pushContainerToRegistry,
  removeContainerLocally,
  createFuncInProvider,
  updateFuncInProvider,
  clearContainerHost,
  getContainerHost,
  buildFunction,
};
