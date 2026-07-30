#!/usr/bin/env bash
# check-validation.sh
# Verifie rapidement si les prerequis AFEAS sont deja valides.
#
# Parite fonctionnelle avec Check-Validation.ps1 :
#   - meme fichier d'etat    : <project-root>/.vscode/afeas.local.settings.json
#   - meme marqueur stdout   : ::VALIDATED::true | ::VALIDATED::false (sensible a la casse)
#   - meme contrat de sortie : 0 = valide, 1 = non valide
#   - meme comportement si le fichier est absent, illisible ou corrompu : non valide
#
# Usage: ./scripts/check-validation.sh [settings-path]

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

SETTINGS_PATH="${1:-$PROJECT_ROOT/.vscode/afeas.local.settings.json}"

PROBLEM_MESSAGE="afeas.local.settings.json: error AFEAS001: Prerequis AFEAS non valides -- lancez la tache 'validate-prerequisites' pour corriger (Ctrl+Shift+P > Executer une tache)."

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

# Emet le marqueur negatif puis sort en 1. Aucun autre code de sortie n'est utilise.
fail_not_validated() {
    echo "::VALIDATED::false"
    echo "$PROBLEM_MESSAGE"
    exit 1
}

if ! require_jq; then
    fail_not_validated
fi

if [ ! -f "$SETTINGS_PATH" ]; then
    fail_not_validated
fi

validated="$(jq -r '."afeas.prerequisites.validated" == true' "$SETTINGS_PATH" 2>/dev/null)" || validated=""

if [ "$validated" != "true" ]; then
    fail_not_validated
fi

echo "::VALIDATED::true"
exit 0
