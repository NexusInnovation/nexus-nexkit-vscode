#!/usr/bin/env bash
# SYNOPSIS
#   Runs a GitHub Actions workflow locally using nektos/act.
#
# DESCRIPTION
#   Wrapper around nektos/act (https://github.com/nektos/act) that runs
#   GitHub Actions workflows on your local machine inside Docker containers,
#   replicating the GitHub-hosted runner environment.
#
#   The script will:
#   - Detect or install act automatically (via Homebrew or curl)
#   - Validate Docker availability
#   - Run the specified workflow with proper flags
#
# USAGE
#   ./run-github-workflow.sh [OPTIONS]
#
# OPTIONS
#   --workflow-file PATH    Path to the workflow YAML file.
#                           Defaults to .github/workflows/ci.yml.
#   --job JOB               Run only the specified job within the workflow.
#   --event EVENT           GitHub event type to simulate
#                           (push, pull_request, workflow_dispatch, etc.).
#                           Defaults to push.
#   --dry-run               Parse and display what would be executed without running.
#   --list                  List all jobs in the workflow without running them.
#   --secrets-file PATH     Path to a file containing secrets in KEY=VALUE format.
#                           Defaults to .secrets in the repository root if it exists.
#   --env-file PATH         Path to a file containing environment variables in KEY=VALUE format.
#   --platform MAPPING      Override the runner platform mapping.
#                           Defaults to ubuntu-latest=catthehacker/ubuntu:act-latest.
#   --artifact-server-path PATH
#                           Path where uploaded artifacts will be stored locally.
#                           Defaults to .act-artifacts in the repository root.
#                           act starts a local artifact server so upload-artifact actions work.
#   --additional-args ARGS  Additional arguments to pass directly to act (space-separated).
#
# EXAMPLES
#   ./run-github-workflow.sh
#   ./run-github-workflow.sh --workflow-file .github/workflows/ci.yml --job build
#   ./run-github-workflow.sh --list
#   ./run-github-workflow.sh --event workflow_dispatch --secrets-file .secrets
#   ./run-github-workflow.sh --dry-run
#
# NOTES
#   Prerequisites:
#   - Docker must be installed and running
#   - act is installed automatically if not found (requires Homebrew on macOS)
#   - Requires bash 4+ or zsh

set -euo pipefail

# --- Parse arguments ---

WORKFLOW_FILE=""
JOB=""
EVENT="push"
DRY_RUN=false
LIST_JOBS=false
SECRETS_FILE=""
ENV_FILE=""
PLATFORM=""
ARTIFACT_SERVER_PATH=""
ADDITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workflow-file)
      WORKFLOW_FILE="$2"
      shift 2
      ;;
    --job)
      JOB="$2"
      shift 2
      ;;
    --event)
      EVENT="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --list)
      LIST_JOBS=true
      shift
      ;;
    --secrets-file)
      SECRETS_FILE="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --artifact-server-path)
      ARTIFACT_SERVER_PATH="$2"
      shift 2
      ;;
    --additional-args)
      shift
      while [[ $# -gt 0 && "${1:0:2}" != "--" ]]; do
        ADDITIONAL_ARGS+=("$1")
        shift
      done
      ;;
    *)
      echo "[WARN] Unknown argument: $1" >&2
      shift
      ;;
  esac
done

# --- Helpers ---

step_header() { printf '\n--- %s ---\n' "$1"; }
ok()          { printf '[OK] %s\n' "$1"; }
warn()        { printf '[WARN] %s\n' "$1"; }
fail()        { printf '[FAIL] %s\n' "$1" >&2; exit 1; }

# --- Resolve repository root ---

REPO_ROOT="$(pwd)"

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  fail "Could not locate the repository root. Run this script from the repo or its scripts/ directory."
fi

# --- Resolve workflow file ---

if [[ -z "$WORKFLOW_FILE" ]]; then
  WORKFLOW_FILE="$REPO_ROOT/.github/workflows/ci.yml"
else
  if [[ "$WORKFLOW_FILE" != /* ]]; then
    WORKFLOW_FILE="$REPO_ROOT/$WORKFLOW_FILE"
  fi
fi

if [[ ! -f "$WORKFLOW_FILE" ]]; then
  fail "Workflow file not found: $WORKFLOW_FILE"
fi

echo "Workflow : ${WORKFLOW_FILE#"$REPO_ROOT"/}"

# --- Check Docker & act (skip for DryRun and List) ---

if [[ "$DRY_RUN" == "false" && "$LIST_JOBS" == "false" ]]; then

  step_header "Checking Docker"

  if ! command -v docker &>/dev/null; then
    fail "Docker is not installed or not in PATH. Install Docker Desktop from https://www.docker.com/products/docker-desktop"
  fi

  if ! docker info &>/dev/null 2>&1; then
    fail "Docker daemon is not running. Please start Docker Desktop."
  fi

  ok "Docker is running."

fi

step_header "Checking act"

ACT_PATH=""
if command -v act &>/dev/null; then
  ACT_PATH="$(command -v act)"
fi

if [[ -z "$ACT_PATH" ]]; then
  warn "act is not installed. Attempting automatic installation..."

  if command -v brew &>/dev/null; then
    echo "  Installing via Homebrew..."
    brew install act
    ACT_PATH="$(command -v act 2>/dev/null || true)"
  fi

  if [[ -z "$ACT_PATH" ]]; then
    fail "Could not install act automatically. Install manually: https://nektosact.com/installation/"
  fi
fi

ACT_VERSION=$("$ACT_PATH" --version 2>&1 || true)
ok "act found: $ACT_VERSION"

# --- Build act arguments ---

step_header "Preparing execution"

ACT_ARGS=()

if [[ "$LIST_JOBS" == "true" ]]; then
  ACT_ARGS+=(--workflows "$WORKFLOW_FILE" --list --matrix "os:ubuntu-latest")
else
  ACT_ARGS+=("$EVENT")
  ACT_ARGS+=(--workflows "$WORKFLOW_FILE")

  if [[ -n "$JOB" ]]; then
    ACT_ARGS+=(--job "$JOB")
    echo "Job      : $JOB"
  fi

  if [[ -n "$PLATFORM" ]]; then
    ACT_ARGS+=(--platform "$PLATFORM")
  else
    ACT_ARGS+=(--platform "ubuntu-latest=catthehacker/ubuntu:act-latest")
    ACT_ARGS+=(--platform "windows-latest=catthehacker/ubuntu:act-latest")
    ACT_ARGS+=(--platform "macos-latest=catthehacker/ubuntu:act-latest")
  fi

  # Local artifact storage so upload-artifact actions don't fail
  if [[ -z "$ARTIFACT_SERVER_PATH" ]]; then
    ARTIFACT_SERVER_PATH="$REPO_ROOT/.act-artifacts"
  fi
  mkdir -p "$ARTIFACT_SERVER_PATH"
  ACT_ARGS+=(--artifact-server-path "$ARTIFACT_SERVER_PATH")
  echo "Artifacts: ${ARTIFACT_SERVER_PATH#"$REPO_ROOT"/}"

  # Secrets file
  if [[ -z "$SECRETS_FILE" ]]; then
    DEFAULT_SECRETS="$REPO_ROOT/.secrets"
    if [[ -f "$DEFAULT_SECRETS" ]]; then
      SECRETS_FILE="$DEFAULT_SECRETS"
    fi
  fi

  if [[ -n "$SECRETS_FILE" ]]; then
    if [[ ! -f "$SECRETS_FILE" ]]; then
      fail "Secrets file not found: $SECRETS_FILE"
    fi
    ACT_ARGS+=(--secret-file "$SECRETS_FILE")
    echo "Secrets  : ${SECRETS_FILE#"$REPO_ROOT"/}"
  fi

  # Env file
  if [[ -n "$ENV_FILE" ]]; then
    if [[ ! -f "$ENV_FILE" ]]; then
      fail "Env file not found: $ENV_FILE"
    fi
    ACT_ARGS+=(--env-file "$ENV_FILE")
    echo "Env file : ${ENV_FILE#"$REPO_ROOT"/}"
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    ACT_ARGS+=(--dryrun)
  fi

  if [[ ${#ADDITIONAL_ARGS[@]} -gt 0 ]]; then
    ACT_ARGS+=("${ADDITIONAL_ARGS[@]}")
  fi
fi

echo "Event    : $EVENT"
echo "Command  : act ${ACT_ARGS[*]}"

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "[DRY RUN] Would execute:"
  echo "  act ${ACT_ARGS[*]}"
  exit 0
fi

# --- Execute ---

step_header "Running workflow"

cd "$REPO_ROOT"
if "$ACT_PATH" "${ACT_ARGS[@]}"; then
  echo ""
  ok "Workflow completed successfully."
  # List collected artifacts
  if [[ -d "$ARTIFACT_SERVER_PATH" ]] && find "$ARTIFACT_SERVER_PATH" -type f 2>/dev/null | grep -q .; then
    echo ""
    echo "Collected artifacts (in ${ARTIFACT_SERVER_PATH#"$REPO_ROOT"/}/):"
    find "$ARTIFACT_SERVER_PATH" -type f -printf '  - %P (%s bytes)\n' 2>/dev/null || \
      find "$ARTIFACT_SERVER_PATH" -type f | while read -r f; do
        rel="${f#"$ARTIFACT_SERVER_PATH"/}"
        size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo "?")
        echo "  - $rel ($size bytes)"
      done
  fi
else
  EXIT_CODE=$?
  echo ""
  fail "Workflow failed with exit code $EXIT_CODE."
fi
