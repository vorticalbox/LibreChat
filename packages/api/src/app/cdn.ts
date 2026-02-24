import { logger } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';

/**
 * Initializes file storage clients based on the configured file strategy.
 * Cloud storage (S3, Azure, Firebase) has been removed from this build.
 * Only local filesystem storage is supported.
 * @param {Object} options
 * @param {AppConfig} options.appConfig - The application configuration
 */
export function initializeFileStorage(_appConfig: AppConfig) {
  logger.debug('Using local filesystem storage (cloud storage removed from this build)');
}
