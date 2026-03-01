/**
 * Lightweight fuzzy search utility for template matching.
 * Scores candidates by how well a query matches their searchable text.
 * No external dependencies required.
 */

/**
 * A scored search result
 */
export interface FuzzySearchResult<T> {
  /** The matched item */
  item: T;
  /** Match score (higher is better, 0 = no match) */
  score: number;
}

/**
 * Perform a fuzzy search on a list of items.
 * Returns items sorted by descending score (best matches first).
 * Items with a score of 0 (no match) are excluded.
 *
 * @param query   The user's search query
 * @param items   The list of items to search
 * @param getText A function that returns the searchable text fields for an item
 * @returns Sorted list of matched items with their scores
 */
export function fuzzySearch<T>(query: string, items: T[], getText: (item: T) => string[]): FuzzySearchResult<T>[] {
  if (!query || query.trim().length === 0) {
    return items.map((item) => ({ item, score: 1 }));
  }

  const normalizedQuery = query.toLowerCase().trim();
  const queryTokens = normalizedQuery.split(/\s+/).filter((t) => t.length > 0);

  const results: FuzzySearchResult<T>[] = [];

  for (const item of items) {
    const fields = getText(item).map((f) => f.toLowerCase());
    const score = scoreItem(queryTokens, normalizedQuery, fields);
    if (score > 0) {
      results.push({ item, score });
    }
  }

  // Sort by descending score
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Score an item against the search query.
 *
 * Scoring tiers (accumulated across all fields):
 * - Exact full match in any field:  +100
 * - Field starts with query:        +50
 * - All query tokens found (AND):   +25
 * - Substring match per token:      +10 each
 * - Fuzzy character match:          +1..5 based on ratio
 */
function scoreItem(queryTokens: string[], fullQuery: string, fields: string[]): number {
  let totalScore = 0;

  for (const field of fields) {
    if (!field) {
      continue;
    }

    // Exact match
    if (field === fullQuery) {
      totalScore += 100;
      continue;
    }

    // Starts with query
    if (field.startsWith(fullQuery)) {
      totalScore += 50;
      continue;
    }

    // Contains full query as substring
    if (field.includes(fullQuery)) {
      totalScore += 30;
      continue;
    }

    // Check each query token
    let tokensFound = 0;
    let tokenScore = 0;
    for (const token of queryTokens) {
      if (field.includes(token)) {
        tokensFound++;
        // Bonus for word boundaries
        const wordBoundaryIndex = field.indexOf(token);
        if (wordBoundaryIndex === 0 || /[\s\-_./]/.test(field[wordBoundaryIndex - 1])) {
          tokenScore += 15;
        } else {
          tokenScore += 10;
        }
      }
    }

    // All tokens found = strong match
    if (tokensFound === queryTokens.length && queryTokens.length > 1) {
      totalScore += 25 + tokenScore;
      continue;
    }

    if (tokenScore > 0) {
      totalScore += tokenScore;
      continue;
    }

    // Fuzzy character matching: check if query characters appear in order
    const fuzzyScore = fuzzyCharScore(fullQuery, field);
    if (fuzzyScore > 0) {
      totalScore += fuzzyScore;
    }
  }

  return totalScore;
}

/**
 * Score based on ordered character matching (fuzzy).
 * Returns a score between 0 and 5 based on the ratio of query chars matched.
 */
function fuzzyCharScore(query: string, field: string): number {
  let queryIdx = 0;
  let consecutiveBonus = 0;
  let lastMatchIdx = -2;

  for (let fieldIdx = 0; fieldIdx < field.length && queryIdx < query.length; fieldIdx++) {
    if (field[fieldIdx] === query[queryIdx]) {
      // Bonus for consecutive matches
      if (fieldIdx === lastMatchIdx + 1) {
        consecutiveBonus += 0.5;
      }
      lastMatchIdx = fieldIdx;
      queryIdx++;
    }
  }

  // All characters must be found in order for a fuzzy match
  if (queryIdx < query.length) {
    return 0;
  }

  // Score based on ratio of chars matched + consecutive bonus
  const ratio = queryIdx / field.length;
  return Math.min(5, Math.round(ratio * 5 + consecutiveBonus));
}
