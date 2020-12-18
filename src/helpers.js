/**
 * Provides a wrapper around process.env for testing
 * @param {string} key the environment variable key
 * @returns {string} the environment variable value
 */
const getEnvVar = (key) => process.env[key];

module.exports = {
  getEnvVar,
};
