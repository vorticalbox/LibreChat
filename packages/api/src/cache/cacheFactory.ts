import { Keyv } from 'keyv';
import createMemoryStore from 'memorystore';
import { Time } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';
import session, { MemoryStore } from 'express-session';
import { cacheConfig } from './cacheConfig';
import { violationFile } from './keyvFiles';

let warnedRedisUnsupported = false;

const warnRedisUnsupported = () => {
  if (!warnedRedisUnsupported) {
    warnedRedisUnsupported = true;
    logger.warn(
      '[Redis] Redis-backed cache/session/rate-limit is disabled in this LibreNano build. Using in-memory stores.',
    );
  }
};

/**
 * Creates a cache instance using in-memory Keyv or a fallback store.
 */
export const standardCache = (namespace: string, ttl?: number, fallbackStore?: object): Keyv => {
  if (cacheConfig.USE_REDIS) {
    warnRedisUnsupported();
  }

  if (fallbackStore) {
    return new Keyv({ store: fallbackStore, namespace, ttl });
  }

  return new Keyv({ namespace, ttl });
};

/**
 * Creates a cache instance for storing violation data.
 */
export const violationCache = (namespace: string, ttl?: number): Keyv => {
  return standardCache(`violations:${namespace}`, ttl, violationFile);
};

/**
 * Creates a session cache instance using in-memory store.
 */
export const sessionCache = (namespace: string, ttl?: number): MemoryStore => {
  void namespace;

  if (cacheConfig.USE_REDIS) {
    warnRedisUnsupported();
  }

  const MemoryStoreCtor = createMemoryStore(session);
  return new MemoryStoreCtor({ ttl, checkPeriod: Time.ONE_DAY });
};

/**
 * Rate limiter store for express-rate-limit.
 * Returns undefined to use built-in in-memory store.
 */
export const limiterCache = (prefix: string): undefined => {
  if (!prefix) {
    throw new Error('prefix is required');
  }

  if (cacheConfig.USE_REDIS) {
    warnRedisUnsupported();
  }

  return undefined;
};
