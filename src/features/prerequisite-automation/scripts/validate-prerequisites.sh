#!/usr/bin/env bash
# validate-prerequisites.sh
# Validates all project prerequisites (Node.js, .NET, Git, pnpm, Azure CLI, Squad)
# Usage: ./scripts/validate-prerequisites.sh
#
# Contrat de sortie : 0 = tous les prerequis REQUIS sont satisfaits, 1 sinon.
# L'etat de validation est persiste dans <project-root>/.vscode/afeas.local.settings.json,
# comme le fait Validate-Prerequisites.ps1, afin que check-validation converge.

set -o pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load requirements
REQUIREMENTS_PATH="$PROJECT_ROOT/requirements.json"
SETTINGS_PATH="${AFEAS_SETTINGS_PATH:-$PROJECT_ROOT/.vscode/afeas.local.settings.json}"

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

if [ ! -f "$REQUIREMENTS_PATH" ]; then
    echo -e "${RED}Error: requirements.json not found at $REQUIREMENTS_PATH${NC}" >&2
    exit 1
fi

# Print colored output
print_colored() {
    local message="$1"
    local color="$2"
    echo -e "${color}${message}${NC}"
}

# Persiste l'etat de validation. Equivalent bash de Update-ValidationState (PowerShell).
# Un fichier de settings illisible est remplace par un objet vide plutot que de bloquer
# indefiniment la convergence check -> validate -> check.
update_validation_state() {
    local validated="$1" # "true" | "false"
    local settings_dir
    local tmp_file
    local current_date

    settings_dir="$(dirname "$SETTINGS_PATH")"

    if ! mkdir -p "$settings_dir" 2>/dev/null; then
        print_colored "Warning: unable to create $settings_dir" "$YELLOW"
        return 1
    fi

    if [ ! -f "$SETTINGS_PATH" ] || ! jq -e . "$SETTINGS_PATH" >/dev/null 2>&1; then
        printf '{}\n' > "$SETTINGS_PATH" 2>/dev/null || {
            print_colored "Warning: unable to write $SETTINGS_PATH" "$YELLOW"
            return 1
        }
    fi

    current_date="$(date "+%Y-%m-%d %H:%M:%S")"
    tmp_file="$SETTINGS_PATH.tmp"

    if jq --argjson validated "$validated" --arg date "$current_date" \
        '."afeas.prerequisites.validated" = $validated | ."afeas.prerequisites.validationDate" = $date' \
        "$SETTINGS_PATH" > "$tmp_file" 2>/dev/null && mv -f "$tmp_file" "$SETTINGS_PATH" 2>/dev/null; then
        return 0
    fi

    rm -f "$tmp_file"
    print_colored "Warning: unable to update validation state in $SETTINGS_PATH" "$YELLOW"
    return 1
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

# Extrait le premier groupe numerique pointe d'une chaine de version.
# "v24.3.0" -> 24.3.0 | "git version 2.43.0" -> 2.43.0 | "azure-cli 2.60.0" -> 2.60.0
# Doit rester strictement equivalent a Get-NormalizedVersion (PowerShell).
normalize_version() {
    printf '%s' "$1" | grep -oE '[0-9]+(\.[0-9]+)*' | head -n1
}

# Compare deux versions composante par composante (les composantes absentes valent 0).
# Retour 0 si current >= minimum, 1 sinon. Une version illisible echoue (fail closed).
compare_versions() {
    local current
    local minimum

    current="$(normalize_version "$1")"
    minimum="$(normalize_version "$2")"

    # Pas de minimum exploitable : rien a verifier.
    [ -z "$minimum" ] && return 0
    # Version courante illisible : on refuse plutot que de supposer.
    [ -z "$current" ] && return 1

    local -a c_parts m_parts
    IFS='.' read -r -a c_parts <<< "$current"
    IFS='.' read -r -a m_parts <<< "$minimum"

    local len=${#c_parts[@]}
    [ ${#m_parts[@]} -gt "$len" ] && len=${#m_parts[@]}

    local i c m
    for ((i = 0; i < len; i++)); do
        c=${c_parts[i]:-0}
        m=${m_parts[i]:-0}
        if [ "$((10#$c))" -gt "$((10#$m))" ]; then
            return 0
        elif [ "$((10#$c))" -lt "$((10#$m))" ]; then
            return 1
        fi
    done

    return 0
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
                    if [ -z "$(normalize_version "$version")" ]; then
                        print_colored "    ⚠ Unable to read a version number (minimum required: $minimum_version)" "$YELLOW"
                    else
                        print_colored "    ⚠ Version is below minimum ($minimum_version)" "$YELLOW"
                    fi
                    return 2  # OUTDATED
                fi
            fi
        elif [ -n "$minimum_version" ]; then
            print_colored "    ⚠ Unable to read a version number (minimum required: $minimum_version)" "$YELLOW"
            return 2  # OUTDATED
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

# Persistance de l'etat sur les deux chemins, comme Validate-Prerequisites.ps1.
if [ $local_exit_code -eq 0 ]; then
    update_validation_state "true"
else
    update_validation_state "false"
fi

echo ""
exit $local_exit_code
