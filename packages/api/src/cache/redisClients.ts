import { logger } from '@librechat/data-schemas';
import type { Redis, Cluster } from 'ioredis';
import { cacheConfig } from './cacheConfig';

export type IORedisClientLike = Redis | Cluster;

export interface KeyvRedisClientLike {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<number | string | null>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: Record<string, unknown>): Promise<'OK' | string | null>;
  del(key: string | string[]): Promise<number>;
  scanIterator(options?: { MATCH?: string; COUNT?: number }): AsyncIterable<string>;
  exists?(key: string): Promise<number>;
  disconnect?(): Promise<void>;
  isOpen?: boolean;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  setMaxListeners?(count: number): void;
}

const ioredisClient: IORedisClientLike | null = null;
const keyvRedisClient: KeyvRedisClientLike | null = null;
const keyvRedisClientReady: Promise<void> | null = null;

if (cacheConfig.USE_REDIS) {
  logger.warn(
    '[Redis] USE_REDIS was enabled, but Redis support is removed in this LibreNano build. Falling back to in-memory cache/streams.',
  );
}

export { ioredisClient, keyvRedisClient, keyvRedisClientReady };
