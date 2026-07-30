#!/bin/bash
# validate-prerequisites.sh
# Validates all project prerequisites (Node.js, .NET, Git, pnpm, Azure CLI, Squad)
# Usage: ./scripts/validate-prerequisites.sh

set -o pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Load requirements
REQUIREMENTS_PATH="$(dirname "$0")/requirements.json"

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required to read requirements.json but is not installed.${NC}"
    echo -e "${YELLOW}Install jq: https://stedolan.github.io/jq/download/${NC}"
    exit 1
fi

if [ ! -f "$REQUIREMENTS_PATH" ]; then
    echo -e "${RED}Error: requirements.json not found at $REQUIREMENTS_PATH${NC}"
    exit 1
fi

# Print colored output
print_colored() {
    local message="$1"
    local color="$2"
    echo -e "${color}${message}${NC}"
}

# Test if command exists and get version
test_command() {
    local command="$1"
    local version_cmd="$2"
    
    if command -v "$command" &> /dev/null; then
        if [ -n "$version_cmd" ]; then
            local version=$(eval "$version_cmd" 2>/dev/null | head -1)
            echo "found:$version"
        else
            echo "found:"
        fi
    else
        echo "not_found"
    fi
}

# Compare versions (semantic versioning)
compare_versions() {
    local current="$1"
    local minimum="$2"
    
    # Remove non-numeric characters except dots
    current=$(echo "$current" | sed 's/[^0-9.].*//')
    minimum=$(echo "$minimum" | sed 's/[^0-9.].*//')
    
    # Simple comparison for common cases
    if [ "$(printf '%s\n' "$minimum" "$current" | sort -V | head -n1)" = "$minimum" ]; then
        return 0  # current >= minimum
    else
        return 1  # current < minimum
    fi
}

# Check individual prerequisite
check_prerequisite() {
    local name="$1"
    local command="$2"
    local version_cmd="$3"
    local minimum_version="$4"
    local required="$5"
    local download_url="$6"
    
    echo ""
    print_colored "Checking: $name" "$MAGENTA"
    
    local result=$(test_command "$command" "$version_cmd")
    
    if [[ "$result" == "found:"* ]]; then
        print_colored "  ✓ FOUND" "$GREEN"
        local version="${result#found:}"
        if [ -n "$version" ]; then
            print_colored "    Version: $version" "$CYAN"
            
            if [ -n "$minimum_version" ]; then
                if compare_versions "$version" "$minimum_version"; then
                    print_colored "    ✓ Version meets minimum requirement ($minimum_version)" "$GREEN"
                else
                    print_colored "    ⚠ Version is below minimum ($minimum_version)" "$YELLOW"
                    return 2  # OUTDATED
                fi
            fi
        fi
        return 0  # OK
    else
        print_colored "  ✗ NOT FOUND" "$RED"
        if [ "$required" = "true" ]; then
            print_colored "    ⚠ REQUIRED prerequisite is missing!" "$RED"
        else
            print_colored "    (Optional - not required)" "$YELLOW"
        fi
        print_colored "    Download: $download_url" "$CYAN"
        if [ "$required" = "true" ]; then
            return 3  # MISSING REQUIRED
        else
            return 1  # MISSING OPTIONAL
        fi
    fi
}

# Main validation
print_colored "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$MAGENTA"
print_colored "  AFEAS PROJECT - PREREQUISITES VALIDATION" "$MAGENTA"
print_colored "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$MAGENTA"

# Check prerequisites dynamically from requirements.json
declare -a failed_required_names=()
declare -a outdated_required_names=()
declare -a failed_optional_names=()
has_required_failure=false

while IFS= read -r prereq; do
    name=$(echo "$prereq" | jq -r '.name')
    cmd=$(echo "$prereq" | jq -r '.command')
    version_cmd=$(echo "$prereq" | jq -r '.versionCommand')
    min_version=$(echo "$prereq" | jq -r '.minimumVersion // empty')
    required=$(echo "$prereq" | jq -r '.required | tostring')
    url=$(echo "$prereq" | jq -r '.install.url')

    check_prerequisite "$name" "$cmd" "$version_cmd" "$min_version" "$required" "$url"
    exit_code=$?

    if [ $exit_code -eq 3 ]; then
        failed_required_names+=("$name")
        has_required_failure=true
    elif [ $exit_code -eq 2 ]; then
        if [ "$required" = "true" ]; then
            outdated_required_names+=("$name")
            has_required_failure=true
        else
            failed_optional_names+=("$name")
        fi
    elif [ $exit_code -eq 1 ]; then
        failed_optional_names+=("$name")
    fi
done < <(jq -c '.prerequisites[]' "$REQUIREMENTS_PATH")

# Summary
print_colored "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$MAGENTA"
print_colored "  VALIDATION SUMMARY" "$MAGENTA"
print_colored "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$MAGENTA"
echo ""

local_exit_code=0

if [ "$has_required_failure" = false ]; then
    print_colored "✓ All required prerequisites are installed and up-to-date!" "$GREEN"

    if [ ${#failed_optional_names[@]} -gt 0 ]; then
        echo ""
        print_colored "⚠ Note: Some optional prerequisites are missing:" "$YELLOW"
        for n in "${failed_optional_names[@]}"; do
            print_colored "  - $n" "$YELLOW"
        done
    fi
else
    print_colored "✗ Validation failed - missing or outdated prerequisites:" "$RED"
    for n in "${failed_required_names[@]}"; do
        print_colored "  [REQUIRED] $n" "$RED"
    done
    for n in "${outdated_required_names[@]}"; do
        print_colored "  [OUTDATED] $n" "$YELLOW"
    done
    local_exit_code=1
fi

echo ""
exit $local_exit_code
