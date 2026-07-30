#!/bin/bash
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
        invoke_command "Configure git hooks" "bash $GIT_HOOKS_SCRIPT" "true"
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

VSCODE_DIR="$PROJECT_ROOT/.vscode"
SETTINGS_FILE="$VSCODE_DIR/settings.json"

# Create settings file if it doesn't exist with basic structure
if [ ! -f "$SETTINGS_FILE" ]; then
    mkdir -p "$VSCODE_DIR"
    echo "{}" > "$SETTINGS_FILE"
fi

# Update settings with completion status
if command -v jq &> /dev/null; then
    CURRENT_DATE=$(date "+%Y-%m-%d %H:%M:%S")
    jq ".\"afeas.prerequisites.validated\" = true | .\"afeas.prerequisites.validationDate\" = \"$CURRENT_DATE\"" "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp"
    mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    print_colored "✓ Setup status stored in .vscode/settings.json" "$GREEN"
else
    print_colored "⚠ jq not available - skipping settings file update" "$YELLOW"
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
