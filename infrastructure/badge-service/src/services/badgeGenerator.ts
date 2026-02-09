/**
 * Badge generator service using badge-maker library
 */

import { makeBadge } from "badge-maker";
import { BadgeOptions } from "../utils/types";

export class BadgeGenerator {
  /**
   * Generate SVG badge
   * @param options Badge options
   * @returns SVG string
   */
  static generate(options: BadgeOptions): string {
    const { label, message, color, style = "flat" } = options;

    return makeBadge({
      label,
      message,
      color,
      style,
    });
  }

  /**
   * Generate version badge
   * @param version Version string
   * @returns SVG string
   */
  static generateVersionBadge(version: string): string {
    return this.generate({
      label: "version",
      message: version,
      color: "blue",
      style: "flat",
    });
  }

  /**
   * Generate release badge
   * @param tagName Release tag name
   * @param isPrerelease Whether this is a prerelease
   * @returns SVG string
   */
  static generateReleaseBadge(tagName: string, isPrerelease: boolean = false): string {
    return this.generate({
      label: "release",
      message: tagName,
      color: isPrerelease ? "orange" : "success",
      style: "flat",
    });
  }

  /**
   * Generate error badge
   * @param message Error message
   * @returns SVG string
   */
  static generateErrorBadge(message: string = "error"): string {
    return this.generate({
      label: "badge",
      message,
      color: "red",
      style: "flat",
    });
  }
}
