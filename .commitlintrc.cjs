module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "chore",
        "revert",
        "ci",
        "build"
      ]
    ],
    "scope-case": [2, "always", "lower-case"],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [0],  // Warn only, don't fail
    "footer-max-line-length": [0]  // Warn only, don't fail
  },
  // Ignore semantic-release auto-generated commits and old merge commits
  ignores: [
    (commit) => /^chore\(release\):/.test(commit),
    (commit) => /^BREAKING CHANGE:/.test(commit),
    (commit) => /BREAKING CHANGE:/.test(commit),  // Anywhere in message
    (commit) => /^Merge branch/.test(commit),  // Merge commits
  ]
};
