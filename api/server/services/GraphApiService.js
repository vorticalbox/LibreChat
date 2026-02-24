// Microsoft Graph API removed
const { logger } = require('@librechat/data-schemas');

class GraphApiService {
  constructor() {
    logger.warn('Microsoft Graph API is not available in this build');
  }

  async isSharePointUrl() {
    return false;
  }

  async getFileContent() {
    throw new Error('Microsoft Graph API is not available');
  }

  async getSharePointFileContent() {
    throw new Error('Microsoft Graph API is not available');
  }
}

module.exports = GraphApiService;
