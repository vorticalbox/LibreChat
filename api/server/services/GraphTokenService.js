// Microsoft Graph Token Service removed
const { logger } = require('@librechat/data-schemas');

class GraphTokenService {
  constructor() {
    logger.warn('Microsoft Graph tokens are not available in this build');
  }

  async getAccessToken() {
    throw new Error('Microsoft Graph API is not available');
  }

  async getUserToken() {
    throw new Error('Microsoft Graph API is not available');
  }
}

module.exports = GraphTokenService;
