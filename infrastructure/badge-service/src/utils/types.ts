/**
 * Type definitions for the badge service
 */

export interface GitHubRelease {
  tagName: string;
  name: string;
  publishedAt: string;
  draft: boolean;
  prerelease: boolean;
}

export interface PackageJson {
  name: string;
  version: string;
  description?: string;
}

export interface BadgeOptions {
  label: string;
  message: string;
  color: string;
  style?: "flat" | "flat-square" | "plastic" | "for-the-badge" | "social";
}

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
