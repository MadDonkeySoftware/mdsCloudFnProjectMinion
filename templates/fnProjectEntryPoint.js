const generateTemplate = (entryPoint) => {
  const parts = entryPoint.split(':');

  return `const fdk = require('@fnproject/fdk');
const userModule = require('./${parts[0]}');

fdk.handle((input) => {
  const result = userModule.${parts[1]}(input);
  if (result && result.then && typeof result.then === 'function') {
    return result.then((innerResult) => innerResult || {});
  }
  return result || {};
});
`};

module.exports = {
  generateTemplate,
};
