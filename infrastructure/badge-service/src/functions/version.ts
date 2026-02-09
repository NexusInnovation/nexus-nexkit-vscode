/**
 * Azure Function: Version Badge
 * Returns SVG badge with current package version
 *
 * Endpoint: GET /api/version
 * Query params:
 *   - style: Badge style (flat, flat-square, plastic, for-the-badge, social)
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { GitHubService } from "../services/githubService";
import { BadgeGenerator } from "../services/badgeGenerator";

async function versionBadge(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Version badge request received");

  try {
    // Fetch package.json from GitHub
    const packageJson = await GitHubService.fetchPackageJson();

    // Generate badge
    const badge = BadgeGenerator.generateVersionBadge(packageJson.version);

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
    context.error("Error generating version badge:", error);

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

app.http("version", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "version",
  handler: versionBadge,
});
