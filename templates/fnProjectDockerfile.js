// Taken from: https://github.com/fnproject/tutorials/blob/36562a1960e332da927030cd4f08521e16d3995d/ContainerAsFunction/Dockerfile
const generateTemplate = (entryPointFileName = 'func.js') => `FROM fnproject/node:dev as build-stage
WORKDIR /function
ADD package.json /function/
RUN npm install --only=prod

FROM fnproject/node
WORKDIR /function
ADD . /function/
COPY --from=build-stage /function/node_modules/ /function/node_modules/
ENTRYPOINT ["node", "${entryPointFileName}"]`;

module.exports = {
  generateTemplate,
};
