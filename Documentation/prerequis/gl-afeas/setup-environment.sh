#!/usr/bin/env bash
# setup-environment.sh
# Complete environment setup: validates prerequisites, configures git hooks, installs dependencies
# Usage: ./scripts/setup-environment.sh

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# jq est un prerequis dur des scripts .sh AFEAS. Message identique dans les 3 scripts.
require_jq() {
    if command -v jq >/dev/null 2>&1; then
        return 0
    fi

    {
        echo "Error: 'jq' is required by the AFEAS prerequisite scripts but was not found on PATH."
        echo "Install jq, then re-run this script:"
        echo "  Debian/Ubuntu : sudo apt-get install -y jq"
        echo "  Fedora/RHEL   : sudo dnf install -y jq"
        echo "  Arch          : sudo pacman -S jq"
        echo "  Alpine        : sudo apk add jq"
        echo "  macOS         : brew install jq"
        echo "  Other         : https://jqlang.github.io/jq/download/"
    } >&2

    return 1
}

if ! require_jq; then
    exit 1
fi

# Parse options
SKIP_VALIDATION=false
SKIP_GIT_HOOKS=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-validation)
            SKIP_VALIDATION=true
            shift
            ;;
        --skip-git-hooks)
            SKIP_GIT_HOOKS=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Print colored output
print_colored() {
    local message="$1"
    local color="$2"
    echo -e "${color}${message}${NC}"
}

# Print section header
print_section() {
    local title="$1"
    echo ""
    print_colored "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$MAGENTA"
    print_colored "  $title" "$MAGENTA"
    print_colored "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$MAGENTA"
    echo ""
}

# Invoke command with error handling
invoke_command() {
    local description="$1"
    local command="$2"
    local continue_on_error="${3:-false}"
    
    print_colored "→ $description" "$CYAN"
    
    if eval "$command"; then
        print_colored "✓ $description completed" "$GREEN"
        return 0
    else
        print_colored "✗ Failed: $description" "$RED"
        
        if [ "$continue_on_error" = "true" ]; then
            print_colored "  (Continuing...)" "$YELLOW"
            return 1
        else
            print_colored "  Setup aborted." "$RED"
            exit 1
        fi
    fi
}

# Main setup
print_colored "$(echo -e '\u2705') AFEAS PROJECT - ENVIRONMENT SETUP\n" "$MAGENTA"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Step 1: Validate prerequisites
if [ "$SKIP_VALIDATION" = false ]; then
    print_section "Step 1: Validating Prerequisites"
    
    VALIDATION_SCRIPT="$SCRIPT_DIR/validate-prerequisites.sh"
    if [ ! -f "$VALIDATION_SCRIPT" ]; then
        print_colored "✗ Validation script not found: $VALIDATION_SCRIPT" "$RED"
        exit 1
    fi
    
    if ! bash "$VALIDATION_SCRIPT"; then
        print_colored "\n✗ Prerequisites validation failed. Please install missing tools and try again." "$RED"
        exit 1
    fi
else
    print_section "Step 1: Skipping Prerequisite Validation"
    print_colored "✓ Validation skipped (--skip-validation flag)" "$GREEN"
fi

# Step 2: Setup Git Hooks
if [ "$SKIP_GIT_HOOKS" = false ]; then
    print_section "Step 2: Configuring Git Hooks"
    
    GIT_HOOKS_SCRIPT="$SCRIPT_DIR/setup-git-hooks.sh"
    if [ -f "$GIT_HOOKS_SCRIPT" ]; then
        # `|| true` est requis : sous `set -e`, un retour non nul de invoke_command
        # ferait sortir le script malgre le drapeau continue-on-error.
        invoke_command "Configure git hooks" "bash '$GIT_HOOKS_SCRIPT'" "true" || true
    else
        print_colored "⚠ Git hooks script not found at $GIT_HOOKS_SCRIPT (optional)" "$YELLOW"
    fi
else
    print_section "Step 2: Skipping Git Hooks Setup"
    print_colored "✓ Git hooks setup skipped (--skip-git-hooks flag)" "$GREEN"
fi

# Step 3: Install Frontend Dependencies
print_section "Step 3: Installing Frontend Dependencies"

invoke_command "Install pnpm dependencies (src/frontend)" "cd '$PROJECT_ROOT/src/frontend' && pnpm install" "false"

# Step 4: Restore Backend Dependencies
print_section "Step 4: Restoring Backend Dependencies"

invoke_command "Restore .NET dependencies (src/backend)" "cd '$PROJECT_ROOT/src/backend' && dotnet restore" "false"

# Step 5: Store setup completion status
print_section "Step 5: Storing Setup Status"

# Fichier d'etat dedie, partage avec Check-Validation.ps1 / check-validation.sh /
# Validate-Prerequisites.ps1 / validate-prerequisites.sh. Ne jamais ecrire l'etat de la
# fonctionnalite dans .vscode/settings.json : ce fichier suit le schema VS Code et est versionne.
SETTINGS_PATH="${AFEAS_SETTINGS_PATH:-$PROJECT_ROOT/.vscode/afeas.local.settings.json}"
SETTINGS_DIR="$(dirname "$SETTINGS_PATH")"

mkdir -p "$SETTINGS_DIR"

# Un fichier illisible est remplace plutot que de bloquer la convergence check -> validate -> check.
if [ ! -f "$SETTINGS_PATH" ] || ! jq -e . "$SETTINGS_PATH" >/dev/null 2>&1; then
    printf '{}\n' > "$SETTINGS_PATH"
fi

CURRENT_DATE=$(date "+%Y-%m-%d %H:%M:%S")
SETTINGS_TMP="$SETTINGS_PATH.tmp"

if jq --argjson validated true --arg date "$CURRENT_DATE" \
    '."afeas.prerequisites.validated" = $validated | ."afeas.prerequisites.validationDate" = $date' \
    "$SETTINGS_PATH" > "$SETTINGS_TMP" && mv -f "$SETTINGS_TMP" "$SETTINGS_PATH"; then
    print_colored "✓ Setup status stored in $SETTINGS_PATH" "$GREEN"
else
    rm -f "$SETTINGS_TMP"
    print_colored "✗ Unable to store setup status in $SETTINGS_PATH" "$RED"
    exit 1
fi

# Final summary
print_section "Setup Complete!"

echo ""
print_colored "✓ Environment is ready to use!\n" "$GREEN"
print_colored "Next steps:" "$CYAN"
print_colored "  1. Press F5 (or run VSCode) to start the full-stack application" "$CYAN"
print_colored "  2. Frontend: http://localhost:5173" "$CYAN"
print_colored "  3. Backend API: https://localhost:7260" "$CYAN"
print_colored "  4. Health check: https://localhost:7260/health" "$CYAN"
echo ""
print_colored "For more information, see: docs/SETUP.md" "$CYAN"
echo ""
