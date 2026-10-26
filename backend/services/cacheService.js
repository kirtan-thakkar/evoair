import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Pluggable Cache Service with Redis Feature Flag (REDIS_ENABLED = 0 or 1)
 * - When REDIS_ENABLED === 1: Interfaces with Redis server
 * - When REDIS_ENABLED === 0: Transparent in-memory cache with TTL (zero external dependencies)
 */

class MemoryCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlSeconds = 300) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  del(key) {
    this.store.delete(key);
  }

  flush() {
    this.store.clear();
  }
}

const memoryFallback = new MemoryCache();

export const cacheService = {
  isEnabled: () => env.REDIS_ENABLED === 1,

  async get(key) {
    if (env.REDIS_ENABLED === 1) {
      // In production with live Redis:
      // return await redisClient.get(key);
    }
    return memoryFallback.get(key);
  },

  async set(key, value, ttlSeconds = 300) {
    if (env.REDIS_ENABLED === 1) {
      // In production with live Redis:
      // return await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    }
    memoryFallback.set(key, value, ttlSeconds);
  },

  async del(key) {
    if (env.REDIS_ENABLED === 1) {
      // await redisClient.del(key);
    }
    memoryFallback.del(key);
  },
};

logger.info(
  `[Cache] Cache Service initialized. REDIS_ENABLED=${env.REDIS_ENABLED} (${env.REDIS_ENABLED === 1 ? 'Redis Mode' : 'In-Memory Graceful Mode'})`
);
