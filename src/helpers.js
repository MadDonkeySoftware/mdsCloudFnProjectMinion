const shelljs = require('shelljs');

const globals = require('./globals');

/**
 * Provides a wrapper around process.env for testing
 * @param {string} key the environment variable key
 * @returns {string} the environment variable value
 */
const getEnvVar = (key) => process.env[key];

/**
 * @typedef {Object} ShellExecuteResult
 * @property {Number} retCode The return code from the shell execution
 * @property {String} stdOut The standard output stream text
 * @property {String} stdErr The standard error stream text
 */

/**
 * Execute a command on the shell and resolve when complete.
 * @param {*} command The command to execute
 * @param {*} options Shelljs options for execution.
 */
const shellExecute = (command, options) => new Promise((resolve) => {
  const logger = globals.getLogger();
  logger.trace({ command, options }, 'Invoking shell command');
  shelljs.exec(command, options, (retCode, stdOut, stdErr) => {
    resolve({ retCode, stdOut, stdErr });
  });
});

module.exports = {
  getEnvVar,
  shellExecute,
};
