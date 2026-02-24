import { logger } from '@librechat/data-schemas';
import { cacheConfig } from './cacheConfig';

interface RedisScanClient {
  del(keys: string[] | string): Promise<number | number[]>;
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string>;
}

/**
 * Efficiently deletes multiple Redis keys with support for both cluster and single-node modes.
 */
export async function batchDeleteKeys(
  client: RedisScanClient,
  keys: string[],
  chunkSize?: number,
): Promise<number> {
  const startTime = Date.now();

  if (keys.length === 0) {
    return 0;
  }

  const size = chunkSize ?? cacheConfig.REDIS_DELETE_CHUNK_SIZE;
  const mode = cacheConfig.USE_REDIS_CLUSTER ? 'cluster' : 'single-node';
  const deletePromises: Array<Promise<number | number[]>> = [];

  if (cacheConfig.USE_REDIS_CLUSTER) {
    for (let i = 0; i < keys.length; i += size) {
      const chunk = keys.slice(i, i + size);
      const clusterDeletes = Promise.all(chunk.map((key) => client.del(key))).then((results) =>
        results.flatMap((result) => (Array.isArray(result) ? result : [result])),
      );
      deletePromises.push(clusterDeletes);
    }
  } else {
    for (let i = 0; i < keys.length; i += size) {
      const chunk = keys.slice(i, i + size);
      deletePromises.push(client.del(chunk));
    }
  }

  const results: Array<number | number[]> = await Promise.all(deletePromises);

  const deletedCount = results.reduce((sum: number, count: number | number[]): number => {
    if (Array.isArray(count)) {
      return sum + count.reduce((a, b) => a + b, 0);
    }
    return sum + count;
  }, 0);

  const duration = Date.now() - startTime;
  const batchCount = deletePromises.length;

  if (duration > 1000) {
    logger.warn(
      `[Redis][batchDeleteKeys] Slow operation - Duration: ${duration}ms, Mode: ${mode}, Keys: ${keys.length}, Deleted: ${deletedCount}, Batches: ${batchCount}, Chunk size: ${size}`,
    );
  } else {
    logger.debug(
      `[Redis][batchDeleteKeys] Duration: ${duration}ms, Mode: ${mode}, Keys: ${keys.length}, Deleted: ${deletedCount}, Batches: ${batchCount}`,
    );
  }

  return deletedCount;
}

/**
 * Scans Redis for keys matching a pattern and collects them into an array.
 */
export async function scanKeys(
  client: RedisScanClient,
  pattern: string,
  count?: number,
): Promise<string[]> {
  const startTime = Date.now();
  const keys: string[] = [];
  const scanCount = count ?? cacheConfig.REDIS_SCAN_COUNT;

  for await (const key of client.scanIterator({
    MATCH: pattern,
    COUNT: scanCount,
  })) {
    keys.push(key);
  }

  const duration = Date.now() - startTime;

  if (duration > 1000) {
    logger.warn(
      `[Redis][scanKeys] Slow operation - Duration: ${duration}ms, Pattern: "${pattern}", Keys found: ${keys.length}, Scan count: ${scanCount}`,
    );
  } else {
    logger.debug(
      `[Redis][scanKeys] Duration: ${duration}ms, Pattern: "${pattern}", Keys found: ${keys.length}`,
    );
  }

  return keys;
}
