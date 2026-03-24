import { useState, useEffect, useCallback } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheOptions {
  ttl?: number;
}

export function useCache<T>(key: string, options: CacheOptions = {}) {
  const { ttl = 5 * 60 * 1000 } = options;
  const [cache, setCache] = useState<Map<string, CacheEntry<T>>>(new Map());

  const get = useCallback((cacheKey: string): T | null => {
    const entry = cache.get(cacheKey);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > ttl;
    if (isExpired) {
      const newCache = new Map(cache);
      newCache.delete(cacheKey);
      setCache(newCache);
      return null;
    }

    return entry.data;
  }, [cache, ttl]);

  const set = useCallback((cacheKey: string, data: T) => {
    const newCache = new Map(cache);
    newCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
    setCache(newCache);
  }, [cache]);

  const clear = useCallback((cacheKey?: string) => {
    if (cacheKey) {
      const newCache = new Map(cache);
      newCache.delete(cacheKey);
      setCache(newCache);
    } else {
      setCache(new Map());
    }
  }, [cache]);

  const has = useCallback((cacheKey: string): boolean => {
    const entry = cache.get(cacheKey);
    if (!entry) return false;

    const isExpired = Date.now() - entry.timestamp > ttl;
    return !isExpired;
  }, [cache, ttl]);

  return {
    get,
    set,
    clear,
    has,
  };
}
