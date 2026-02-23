const { Time } = require('librechat-data-provider');
const { FlowStateManager } = require('@librechat/api');
const logger = require('./winston');

let flowManager = null;

/**
 * @param {Keyv} flowsCache
 * @returns {FlowStateManager}
 */
function getFlowStateManager(flowsCache) {
  if (!flowManager) {
    flowManager = new FlowStateManager(flowsCache, {
      ttl: Time.ONE_MINUTE * 3,
    });
  }
  return flowManager;
}

module.exports = {
  logger,
  getFlowStateManager,
};
