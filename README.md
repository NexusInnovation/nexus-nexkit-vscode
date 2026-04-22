# Nexkit VS Code Extension

[![CI/CD Pipeline](https://github.com/NexusInnovation/nexus-nexkit-vscode/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/NexusInnovation/nexus-nexkit-vscode/actions/workflows/ci-cd.yml)
[![Latest Release](https://img.shields.io/github/v/release/NexusInnovation/nexus-nexkit-vscode)](https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Une extension VS Code complète qui optimise vos workflows de développement avec GitHub Copilot en fournissant des templates IA (agents, prompts, instructions, chatmodes), l'initialisation de workspace et la gestion des serveurs MCP.

## 🚀 Installation Rapide

### Installation Automatique (Recommandée)

**Pour Windows :**

1. **Ouvrir PowerShell en mode Administrateur**
   - Clic droit sur le menu Démarrer
   - Sélectionner "Windows PowerShell (Admin)" ou "Terminal (Admin)"

2. **Exécuter la commande d'installation**

   ```powershell
   irm https://raw.githubusercontent.com/Nexusinnovation/nexus-nexkit-vscode/develop/scripts/install-vscode-with-nexkit.ps1 | iex
   ```

3. **C'est tout !** Le script installera automatiquement :
   - VS Code (si non installé)
   - L'extension Nexkit
   - Les serveurs MCP requis (Context7 et Sequential Thinking)
   - Les configurations recommandées

> **Note** : Cette installation nécessite des droits administrateur pour installer VS Code si celui-ci n'est pas déjà présent sur votre système.

## 🎯 Modes d'Utilisation

Nexkit propose **deux modes** adaptés à différents profils d'utilisateurs :

### Mode Développeur (par défaut)

**Pour qui ?** Développeurs et équipes techniques

**Fonctionnalités complètes :**

- ✅ **Actions** : Initialisation de workspace
- ✅ **Profiles** : Sauvegarde et application de configurations de templates
- ✅ **Templates** : Navigation et installation de templates IA depuis les dépôts
- ✅ **Repositories** : Vue de toutes les sources de templates configurées
- ✅ **Footer** : Feedback et informations de version

**Cas d'usage :**

- Développement de nouvelles fonctionnalités
- Personnalisation des agents GitHub Copilot
- Gestion de multiples dépôts de templates
- Configuration avancée de l'environnement de développement

### Mode APM (Application Portfolio Management)

**Pour qui ?** Gestionnaires d'applications et analystes métier

**Interface simplifiée :**

- ✅ **Footer** : Feedback et informations de version
- 🎯 Interface épurée pour un usage ciblé

**Cas d'usage :**

- Gestion de portefeuille d'applications
- Consultation et reporting
- Workflows métier spécialisés

### Changer de Mode

**Lors de l'initialisation :**

- Nexkit vous demandera de choisir votre mode au premier démarrage

**Via la palette de commandes :**

- `Ctrl+Shift+P` (ou `Cmd+Shift+P` sur macOS)
- Tapez "Nexkit: Switch Operation Mode"
- Sélectionnez votre mode préféré

**Via les paramètres :**

- `Ctrl+,` (ou `Cmd+,` sur macOS)
- Recherchez "nexkit.mode"
- Choisissez "Developers" ou "APM"

## ✨ Fonctionnalités Principales

### Commandes Essentielles

Accédez aux commandes via la palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) :

- **Nexkit: Initialize Workspace** - Configure votre workspace avec :
  - Templates IA (agents, prompts, chatmodes) installés dans `.nexkit/`
  - Paramètres VS Code pour découverte automatique des agents, prompts et skills
  - Extensions VS Code recommandées
  - Configuration des serveurs MCP au niveau workspace
  - Entrée `.gitignore` pour ignorer le dossier `.nexkit/`

- **Nexkit: Install User MCP Servers** - Installe les serveurs MCP requis (Context7 et Sequential Thinking)

- **Nexkit: Check for Updates** - Vérifie et installe les mises à jour de l'extension

- **Nexkit: Open Settings** - Accès rapide aux paramètres

- **Nexkit: Restore Template Backup** - Restaure les templates depuis les sauvegardes automatiques

### Panneau Latéral

Un panneau dédié dans la barre d'activité offre :

- Navigation des templates IA depuis tous les dépôts configurés
- Installation de templates individuels ou par lots
- Accès rapide aux paramètres et à l'installation MCP
- Synchronisation en temps réel des dépôts de templates

### Système de Dépôts de Templates IA

L'extension récupère des templates IA depuis des dépôts GitHub :

- **Dépôt par Défaut** : [Nexus Templates](https://github.com/NexusInnovation/nexus-nexkit-templates) (toujours activé)
- **Dépôts Personnalisés** : Ajoutez vos propres dépôts via les paramètres
- **Types de Templates** :
  - **Agents** : Agents GitHub Copilot personnalisés
  - **Prompts** : Prompts IA réutilisables
  - **Instructions** : Directives de codage spécifiques par langage
  - **Chatmodes** : Modes de chat spécialisés (debug, plan, etc.)
  - **Skills** : Structures de dossiers pré-construites avec code, configurations et utilitaires installables directement dans votre projet

Les templates sont automatiquement récupérés lors de l'activation de l'extension et peuvent être actualisés lorsque les configurations de dépôt changent.

### Fonctionnalités Automatiques

- **Vérification des Mises à Jour** : Vérifie automatiquement les nouvelles versions toutes les 24 heures (configurable)
- **Notifications MCP** : Alerte lorsque les serveurs MCP requis ne sont pas installés
- **Invites d'Initialisation** : Suggère l'initialisation pour les nouveaux workspaces
- **Sauvegardes Automatiques** : Sauvegarde les templates existants (`.nexkit/`) avant écrasement avec le préfixe `.nexkit.backup-`
- **Surveillance des Configurations** : Actualise les templates lors de modifications des paramètres de dépôt

## 🚦 Démarrage Rapide

### Après Installation

1. **Ouvrir VS Code**
   - L'extension Nexkit se charge automatiquement

2. **Choisir votre Mode** (au premier lancement)
   - Mode **Développeur** : Fonctionnalités complètes
   - Mode **APM** : Interface simplifiée

3. **Initialiser votre Workspace**
   - Ouvrir la palette de commandes (`Ctrl+Shift+P`)
   - Taper "Nexkit: Initialize Workspace"
   - Confirmer l'initialisation

4. **Commencer à Coder !**
   - Les templates IA sont maintenant disponibles
   - GitHub Copilot utilise automatiquement les agents configurés
   - Les serveurs MCP enrichissent l'expérience de développement

## 📦 Installation Manuelle (Alternative)

### Depuis GitHub Releases

1. **Télécharger le package VSIX**
   - Visitez la [dernière version](https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/latest)
   - Téléchargez le fichier `.vsix`
   - Ou utilisez le lien direct : [Download Latest VSIX](https://github.com/NexusInnovation/nexus-nexkit-vscode/releases/latest/download/nexkit-vscode.vsix)

2. **Installer dans VS Code**

   ```bash
   # Via VS Code CLI
   code --install-extension nexkit-vscode.vsix

   # Ou via l'interface VS Code
   # 1. Ouvrir VS Code
   # 2. Appuyer sur Ctrl+Shift+P (Cmd+Shift+P sur macOS)
   # 3. Taper "Extensions: Install from VSIX..."
   # 4. Sélectionner le fichier .vsix téléchargé
   ```

3. **Vérifier l'Installation**
   - Ouvrir la palette de commandes (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Taper "Nexkit" pour voir les commandes disponibles
   - Exécuter "Nexkit: Initialize Workspace" pour configurer votre premier projet

### Versions Pré-release

Les versions pré-release (beta) sont disponibles depuis la branche develop :

- Recherchez les versions étiquetées `-beta.N`
- Marquées comme "Pre-release" sur GitHub
- Suivez les mêmes étapes d'installation ci-dessus

## 📋 Prérequis

- **VS Code** : Version 1.105.0 ou supérieure
- **PowerShell** : Pour l'installation automatique (inclus avec Windows)
- **Droits Administrateur** : Requis pour l'installation automatique
- **Serveurs MCP** (optionnel, mais recommandé) :
  - **Context7** : Fournit de la documentation à jour sur les bibliothèques
  - **Sequential Thinking** : Raisonnement amélioré pour les tâches complexes
  - Les deux peuvent être installés via la commande "Nexkit: Install User MCP Servers" ou automatiquement avec le script d'installation

## ⚙️ Configuration

### Configuration des Dépôts

**`nexkit.repositories`** - Configurer des dépôts de templates supplémentaires

L'extension supporte à la fois les **dépôts GitHub** et les **dossiers locaux** comme sources de templates.

Par défaut, inclut le dépôt "Awesome Copilot". Le dépôt "Nexus Templates" est toujours inclus et ne peut être supprimé.

#### Exemple de Dépôt GitHub

```json
{
  "nexkit.repositories": [
    {
      "name": "My Custom Templates",
      "type": "github",
      "url": "https://github.com/myorg/my-templates",
      "branch": "main",
      "enabled": true,
      "paths": {
        "agents": "agents",
        "prompts": "prompts",
        "skills": "skills",
        "instructions": "instructions",
        "chatmodes": "chatmodes"
      }
    }
  ]
}
```

#### Exemple de Dossier Local

Utilisez des dossiers locaux pour des templates internes personnalisés, le développement ou le travail hors ligne :

```json
{
  "nexkit.repositories": [
    {
      "name": "My Local Templates",
      "type": "local",
      "url": "./templates",
      "enabled": true,
      "paths": {
        "agents": "agents",
        "prompts": "prompts"
      }
    }
  ]
}
```

**Formats de Chemins Supportés pour les Dépôts Locaux :**

- **Relatif au workspace** : `./templates` ou `../shared-templates`
- **Chemins absolus** : `C:\CompanyAssets\ai-templates` (Windows) ou `/home/user/templates` (Unix)
- **Répertoire personnel** : `~/my-templates`

**Note** : Le champ `branch` s'applique uniquement aux dépôts GitHub et sera ignoré pour les dépôts locaux.

### Paramètres de Mise à Jour

- **`nexkit.extension.autoCheckUpdates`** - Vérifier automatiquement les mises à jour au démarrage (par défaut : `true`)
- **`nexkit.extension.updateCheckInterval`** - Heures entre vérifications de mise à jour (par défaut : `24`)

### Configuration MCP

- **`nexkit.mcpSetup.dismissed`** - Si la notification de configuration MCP a été ignorée (par défaut : `false`)

### Mode Utilisateur

- **`nexkit.userMode`** - Mode utilisateur pour Nexkit (par défaut : `notset`)
  - **Mode APM** : Templates et paramètres optimisés pour les workflows de gestion de portefeuille d'applications
  - **Mode Développeur** : Outils et templates de développement complets
  - Lors de la première activation, les utilisateurs sont invités à choisir leur mode préféré

### Télémétrie

- **`nexkit.telemetry.enabled`** - Activer la télémétrie anonyme d'utilisation (par défaut : `true`, respecte le paramètre global de télémétrie de VS Code)
- **`nexkit.telemetry.connectionString`** - Chaîne de connexion Azure Application Insights (optionnel, pour un endpoint de télémétrie personnalisé)

## 🔧 Fonctionnement

### Configuration Initiale

Lors de la première activation de Nexkit :

1. **Choix du Mode** : Vous devrez choisir entre :
   - **Mode APM** : Optimisé pour les workflows de gestion d'applications
   - **Mode Développeur** : Suite complète d'outils et templates de développement
2. Votre sélection est enregistrée dans `nexkit.userMode` et peut être modifiée à tout moment dans les paramètres
3. Cette invite n'apparaît qu'une seule fois - lors de la première activation

### Initialisation du Workspace

Lorsque vous exécutez "Nexkit: Initialize Workspace" :

1. **Création de Sauvegarde** : Le répertoire `.nexkit` existant est automatiquement sauvegardé
2. **Déploiement de Configuration** :
   - Entrée `.gitignore` pour ignorer le dossier `.nexkit/`
   - `.vscode/settings.json` avec paramètres recommandés (incluant les sources agents, prompts et skills)
   - `.vscode/extensions.json` avec extensions recommandées
   - `.vscode/mcp.json` pour la configuration MCP au niveau workspace
3. **Installation de Templates** : Agents, prompts et chatmodes du dépôt Nexus Templates sont installés dans `.nexkit/`
4. **Marquage du Workspace** : Définit `nexkit.workspace.initialized` pour éviter les invites dupliquées

### Structure des Templates

Les templates déployés dans votre workspace suivent cette structure :

```
.nexkit/
├── agents/              # Agents GitHub Copilot personnalisés
├── prompts/             # Prompts IA réutilisables
├── skills/              # Définition des skills tel que défini par Anthropic (1)
└── instructions/        # Directives de codage (non installées automatiquement)
```

> (1) [Anthropic](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

Le dossier `.nexkit/` est automatiquement configuré comme source pour GitHub Copilot via les paramètres VS Code déployés :

```json
{
  "chat.promptFilesLocations":       { ".nexkit/prompts": true },
  "chat.instructionsFilesLocations": { ".nexkit/instructions": true },
  "chat.agentFilesLocations":        { ".nexkit/agents": true },
  "chat.agentSkillsLocations":       { ".nexkit/skills": true }
}
```

Ces paramètres permettent à GitHub Copilot de découvrir automatiquement vos agents, prompts et instructions sans configuration manuelle supplémentaire.

Chaque fichier template contient des instructions spécialisées pour GitHub Copilot afin d'améliorer votre workflow de développement.

## 💡 Exemples d'Utilisation

### Configuration d'un Nouveau Projet

```bash
# 1. Ouvrir votre dossier de projet dans VS Code
code /chemin/vers/mon-projet

# 2. Ouvrir la palette de commandes (Ctrl+Shift+P / Cmd+Shift+P)
# 3. Exécuter : "Nexkit: Initialize Workspace"
# 4. Votre workspace est maintenant configuré avec les templates IA et les paramètres !
```

### Ajout de Dépôts de Templates Personnalisés

#### Dépôt GitHub

```json
// In your VS Code settings.json (File > Preferences > Settings)
{
  "nexkit.repositories": [
    {
      "name": "Company Templates",
      "type": "github",
      "url": "https://github.com/mycompany/ai-templates",
      "enabled": true,
      "paths": {
        "agents": "copilot-agents",
        "prompts": "ai-prompts",
        "skills": "skills"
      }
    }
  ]
}
```

#### Dépôt de Dossier Local

```json
// In your VS Code settings.json (File > Preferences > Settings)
{
  "nexkit.repositories": [
    {
      "name": "Local Dev Templates",
      "type": "local",
      "url": "./my-templates",
      "enabled": true,
      "paths": {
        "agents": "agents",
        "prompts": "prompts"
      }
    }
  ]
}
```

**Cas d'Usage pour les Dépôts Locaux :**

- **Développement** : Tester les templates localement avant de les commiter sur GitHub
- **Environnements d'Entreprise** : Utiliser des partages réseau internes ou chemins locaux
- **Travail Hors Ligne** : Accéder aux templates sans connexion internet
- **Templates Privés** : Garder les templates sensibles hors du contrôle de version

### Installation des Serveurs MCP

```bash
# Ouvrir la palette de commandes (Ctrl+Shift+P / Cmd+Shift+P)
# Exécuter : "Nexkit: Install User MCP Servers"
# Suivre les invites pour configurer Context7 et Sequential Thinking
```

## ⚠️ Problèmes Connus

Consultez les [GitHub Issues](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues) pour les problèmes connus et les rapports de bugs.

Problèmes courants :

- **Limitation de l'API GitHub** : La récupération de templates peut être limitée avec des requêtes non authentifiées
- **Téléchargement VSIX** : Certains réseaux d'entreprise peuvent bloquer les téléchargements directs d'assets GitHub

## 📝 Notes de Version

Consultez [CHANGELOG.md](CHANGELOG.md) pour l'historique détaillé des versions et notes de version.

### Version Actuelle : 0.6.0

Les dernières fonctionnalités incluent :

- Gestion multi-dépôt de templates IA
- Panneau latéral webview pour parcourir les templates
- Système automatisé de mise à jour de l'extension
- Initialisation complète de workspace
- Configuration MCP au niveau utilisateur et workspace

---

## 📚 Vie Privée et Télémétrie

Cette extension collecte des données de télémétrie anonymes pour aider à améliorer Nexkit. Les données incluent :

- Activation de l'extension et durée de session
- Commandes exécutées (sans données utilisateur ni contenu de fichiers)
- Occurrences d'erreurs (sans informations personnelles)
- Métriques de performance (temps d'exécution des commandes)
- Version de l'extension et de VS Code
- Type de système d'exploitation

### Ce qui N'EST PAS collecté

- Aucune information personnellement identifiable (PII)
- Aucun nom, chemin ou contenu de fichier
- Aucun nom de workspace ou de projet
- Aucune valeur de paramètre ou configuration utilisateur
- Aucune adresse IP (masquée par défaut)

### Désactivation

La télémétrie respecte vos préférences de confidentialité :

1. **Paramètre Global VS Code** : Si vous avez désactivé la télémétrie dans VS Code (`telemetry.telemetryLevel` sur `off`), la télémétrie Nexkit est automatiquement désactivée.

2. **Paramètre Spécifique Nexkit** : Vous pouvez désactiver la télémétrie Nexkit séparément :
   - Ouvrir Paramètres (Ctrl+, ou Cmd+,)
   - Rechercher "Nexkit Telemetry"
   - Décocher "Nexkit: Telemetry Enabled"

   Ou ajouter dans votre `settings.json` :

   ```json
   {
     "nexkit.telemetry.enabled": false
   }
   ```

Pour plus d'informations sur la collecte et le stockage des données, consultez [docs/TELEMETRY_SETUP.md](docs/TELEMETRY_SETUP.md).

## 👥 Contribution

Les contributions sont les bienvenues ! Consultez [CONTRIBUTING.md](docs/CONTRIBUTING.md) pour :

- Directives de style de code
- Conventions de messages de commit (Conventional Commits)
- Processus de pull request
- Exigences de test

## 📜 Licence

Licence MIT - Consultez le fichier [LICENSE](LICENSE) pour plus de détails.

## 👬 Support

- **Problèmes** : [GitHub Issues](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues)
- **Discussions** : [GitHub Discussions](https://github.com/NexusInnovation/nexus-nexkit-vscode/discussions)

---

**Maintenu par** : Nexus Innovation  
**Dépôt** : [github.com/NexusInnovation/nexus-nexkit-vscode](https://github.com/NexusInnovation/nexus-nexkit-vscode)
