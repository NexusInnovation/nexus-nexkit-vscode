/**
 * Simple in-memory cache with TTL support
 */

import { CacheEntry } from "./types";

export class Cache {
  private static store = new Map<string, CacheEntry<any>>();

  /**
   * Get value from cache
   * @param key Cache key
   * @returns Cached value or undefined if not found or expired
   */
  static get<T>(key: string): T | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Set value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttlSeconds Time to live in seconds
   */
  static set<T>(key: string, value: T, ttlSeconds: number): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { data: value, expiresAt });
  }

  /**
   * Clear a specific cache entry
   * @param key Cache key
   */
  static clear(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clear all cache entries
   */
  static clearAll(): void {
    this.store.clear();
  }

  /**
   * Clean up expired entries
   */
  static cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

// Run cleanup every 10 minutes
setInterval(() => Cache.cleanup(), 10 * 60 * 1000);
