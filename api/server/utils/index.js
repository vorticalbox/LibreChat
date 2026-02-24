const removePorts = require('./removePorts');
const handleText = require('./handleText');
const queue = require('./queue');
const files = require('./files');

module.exports = {
  ...handleText,
  removePorts,
  ...files,
  ...queue,
};
