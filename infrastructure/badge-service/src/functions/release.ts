/**
 * Azure Function: Release Badge
 * Returns SVG badge with latest release information
 *
 * Endpoint: GET /api/release
 * Query params:
 *   - style: Badge style (flat, flat-square, plastic, for-the-badge, social)
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { GitHubService } from "../services/githubService";
import { BadgeGenerator } from "../services/badgeGenerator";

async function releaseBadge(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Release badge request received");

  try {
    // Fetch latest release from GitHub
    const release = await GitHubService.fetchLatestRelease();

    // Generate badge based on release status
    const badge = BadgeGenerator.generateReleaseBadge(release.tagName, release.prerelease);

    // Return SVG with proper headers
    return {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        "Access-Control-Allow-Origin": "*",
      },
      body: badge,
    };
  } catch (error) {
    context.error("Error generating release badge:", error);

    // Return error badge
    const errorBadge = BadgeGenerator.generateErrorBadge("unavailable");
    return {
      status: 500,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-cache",
      },
      body: errorBadge,
    };
  }
}

app.http("release", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "release",
  handler: releaseBadge,
});
