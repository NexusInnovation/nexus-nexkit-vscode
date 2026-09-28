# PRD — Gestion de Squad dans NexKit

## Contexte et problème

NexKit est une extension VS Code qui installe et maintient des modèles d'IA depuis des dépôts GitHub : agents, prompts, instructions, chatmodes, profils et configuration MCP. L'extension possède déjà une architecture par services sous `src/features/*`, une injection de dépendances dans `src/core/serviceContainer.ts`, un seul panneau webview `nexkitPanelView`, une SPA Preact sous `src/features/panel-ui/webview`, un routage de messages centralisé via `nexkitPanelMessageHandler.ts` et un état d'application centralisé. Elle sait aussi authentifier GitHub via `RepositoryTemplateProvider` et `GitHubAuthHelper`, sauvegarder avant écrasement avec `BackupService`, persister certains états dans `workspaceState`, mettre à jour l'extension via GitHub Releases et lancer des processus externes.

Squad est un outil complémentaire qui installe une équipe d'agents persistante dans un dépôt, principalement sous `.squad/` et `.github/agents/squad.agent.md`, puis pilote des opérations via le CLI `@bradygaster/squad-cli`. Aujourd'hui NexKit ne contient aucun code Squad. Les utilisateurs doivent installer, initialiser, inspecter, maintenir et faire évoluer Squad hors de l'expérience NexKit, ce qui crée une rupture de parcours, peu de visibilité sur l'état réel du dépôt, et aucune intégration avec les profils et plugins NexKit.

Le besoin est d'ajouter une gestion Squad dans NexKit, sans remplacer Squad CLI : NexKit doit fournir une expérience VS Code intégrée, guidée et sécurisée, tout en laissant Squad rester propriétaire de ses opérations d'écriture et de migration.

## Objectifs et non-objectifs

### Objectifs

- Ajouter un onglet Squad dans le panneau NexKit existant, sans créer de nouvelle vue VS Code.
- Permettre d'initialiser Squad depuis un preset fourni par un plugin de la marketplace Nexus.
- Lire directement les fichiers `.squad/` pour l'affichage, l'édition contrôlée et la navigation.
- Utiliser Squad CLI pour les opérations officielles : `init`, `upgrade`, `upstream`, `plugin`, `doctor`, `export`, `import`, `watch`.
- Détecter les versions installées, les mises à jour CLI et les mises à jour de projet, puis demander confirmation avant toute modification.
- Sauvegarder les fichiers avant toute écriture ou commande susceptible d'écraser des fichiers Squad.
- Supporter en v1 les backlogs GitHub Issues et Azure DevOps.
- Préparer l'intégration des hiérarchies Nexus core/département/équipe/projet via les plugins de `NexusInnovation/nexus-plugin-marketplace`.
- Respecter les règles NexKit existantes : `SettingsManager`, `BackupService`, télémétrie anonyme et consentie, robustesse cross-platform.

### Non-objectifs

- Ne pas créer de GitHub issues dans le cadre de ce PRD.
- Ne pas écrire les quatre presets Squad initiaux dans la marketplace dans cette phase.
- Ne pas réimplémenter Squad CLI ni ses migrations.
- Ne pas ajouter GitHub Projects en v1.
- Ne pas ajouter Jira en v1.
- Ne pas créer une nouvelle webview ou un nouveau container VS Code.
- Ne pas engager de synchronisation cloud propriétaire NexKit pour les équipes personnelles Squad.

## Personas

- **Eric, Lead/Architecte** : veut initialiser une équipe Squad conforme aux standards Nexus, vérifier son état, contrôler les mises à jour et préparer les itérations produit.
- **Développeur de projet** : veut voir les membres, charters, décisions, routing, logs et historique sans ouvrir manuellement plusieurs fichiers Markdown/JSON.
- **Mainteneur de plugin Nexus** : veut publier un preset Squad dans le plugin d'équipe, avec un contrat clair et validable.
- **Administrateur de plateforme** : veut recommander une hiérarchie d'héritage upstream org → team → project, tout en permettant des sources libres.
- **Agent NexKit/Squad** : consomme les fichiers `.squad/`, les profils NexKit et les conventions du dépôt pour travailler avec un contexte stable.

## Glossaire

- **Squad CLI** : exécutable `squad` fourni par `@bradygaster/squad-cli`.
- **Squad projet** : dossier `.squad/` et agent `.github/agents/squad.agent.md` installés dans un dépôt.
- **Preset Squad Nexus** : sous-dossier `squad/` dans un plugin Nexus contenant les fichiers de départ d'une équipe.
- **Upstream Inheritance** : mécanisme Squad qui référence des sources externes dans `.squad/upstream.json`.
- **Marketplace Nexus** : dépôt `NexusInnovation/nexus-plugin-marketplace` contenant `.github/plugin/marketplace.json` et les plugins Nexus.
- **Ralph** : membre/moniteur Squad pour backlog, triage, PR, CI et mode `squad watch`.
- **Mode hybride** : NexKit lit/édite les fichiers quand c'est sûr, mais délègue les opérations officielles à Squad CLI.

## Exigences fonctionnelles par épique

### Épique A — Détection, installation et version

- **FR-001** : NexKit doit détecter si un dépôt contient Squad via `.squad/config.json`, `.squad/team.md` et `.github/agents/squad.agent.md`.
- **FR-002** : NexKit doit lire la version Squad projet depuis le commentaire `<!-- version: x -->` de `.github/agents/squad.agent.md`, avec état `inconnu` si absent.
- **FR-003** : NexKit doit détecter le CLI `squad` via exécution non interactive (`squad version` ou `squad --version`) avec timeout.
- **FR-004** : Si le CLI est absent, NexKit doit proposer : installer globalement avec `npm install -g @bradygaster/squad-cli@latest`, utiliser `npx @bradygaster/squad-cli`, ou configurer un chemin personnalisé.
- **FR-005** : NexKit doit détecter les mises à jour CLI et projet, notifier l'utilisateur, et ne lancer `squad upgrade --self` ou `squad upgrade` qu'après confirmation.
- **FR-006** : NexKit doit créer une sauvegarde via `BackupService` avant `squad upgrade`, import, initialisation avec écrasement, ou toute édition directe d'un fichier existant.

### Épique B — Initialisation depuis presets Nexus

- **FR-010** : NexKit doit afficher les presets Squad disponibles dans les plugins Nexus.
- **FR-011** : NexKit doit supporter un sous-dossier réservé `squad/` dans chaque plugin d'équipe.
- **FR-012** : NexKit doit gérer les plugins locaux de la marketplace et les plugins externes comme `greffondors`, dont la définition pointe vers un dépôt privé externe.
- **FR-013** : NexKit doit télécharger récursivement le dossier `squad/` d'un plugin, pas seulement `skills/`.
- **FR-014** : NexKit doit initialiser Squad en combinant le preset sélectionné et `squad init`, sans écraser silencieusement un Squad existant.
- **FR-015** : Si aucun preset n'est disponible, NexKit doit proposer une initialisation Squad standard via CLI.

### Épique C — Onglet Squad dans le panneau NexKit

- **FR-020** : NexKit doit ajouter un onglet Squad dans la SPA Preact existante.
- **FR-021** : L'onglet doit afficher le statut : installé/non installé, version projet, version CLI, backlog détecté, upstreams, plugins et diagnostics.
- **FR-022** : L'onglet doit afficher le roster depuis `.squad/team.md` et les agents depuis `.squad/agents/*/charter.md`.
- **FR-023** : L'utilisateur doit pouvoir lire et éditer les charters dans l'onglet, avec sauvegarde avant écriture.
- **FR-024** : L'onglet doit afficher et éditer `.squad/decisions.md` et `.squad/routing.md`.
- **FR-025** : L'onglet doit afficher les historiques agents (`history.md`), logs et orchestration logs en lecture seule au MVP.
- **FR-026** : L'onglet doit afficher les skills d'équipe, incluant `.copilot/skills/` et les chemins Squad pertinents si présents.
- **FR-027** : L'onglet doit exposer casting et ajout/retrait de membres, d'abord par commandes CLI quand disponibles, sinon par édition guidée si le format est sûr.
- **FR-028** : L'onglet doit afficher le statut Ralph/backlog et offrir le démarrage/arrêt de `squad watch`.

### Épique D — Upstream Inheritance Nexus

- **FR-030** : NexKit doit afficher `.squad/upstream.json`, ses sources, types, références et dates de synchronisation.
- **FR-031** : NexKit doit permettre d'ajouter une source libre local/git/export via `squad upstream add`.
- **FR-032** : NexKit doit permettre `list`, `sync` et `remove` via Squad CLI.
- **FR-033** : NexKit doit recommander une hiérarchie org → team → project.
- **FR-034** : NexKit doit proposer `NexusInnovation/nexus-plugin-marketplace` comme source préconfigurée pour les niveaux Nexus, avec dossiers réservés par niveau si techniquement viable.
- **FR-035** : NexKit doit signaler clairement le risque que `squad upstream` clone un dépôt git complet et ne supporte pas les sous-chemins. Alternative proposée : dépôts upstream dédiés par niveau ou exports JSON générés depuis les sous-dossiers.

### Épique E — Plugins Squad

- **FR-040** : NexKit doit préenregistrer la marketplace Nexus comme marketplace Squad lorsque demandé par l'utilisateur.
- **FR-041** : NexKit doit permettre d'ajouter une marketplace libre via `squad plugin marketplace add`.
- **FR-042** : NexKit doit afficher les marketplaces depuis `.squad/plugins/marketplaces.json`.
- **FR-043** : NexKit doit afficher les plugins installés via `squad plugin list --json` lorsque disponible.
- **FR-044** : NexKit doit lancer validate/dry-run/install/enable/disable/uninstall/refresh avec confirmation pour les opérations d'écriture.

### Épique F — Backlog, Ralph et cérémonies

- **FR-050** : En v1, NexKit doit supporter GitHub Issues comme backlog Squad, en utilisant `gh` et l'état de configuration existant de Squad.
- **FR-051** : En v1, NexKit doit supporter Azure DevOps via configuration `.squad/config.json` (`platform`, `ado.org`, `ado.project`, `defaultWorkItemType`, `areaPath`, `iterationPath`) et `az`/ADO selon Squad.
- **FR-052** : NexKit ne doit pas inclure GitHub Projects en v1, mais peut afficher un état "prévu/non activé".
- **FR-053** : Jira doit être différé et indiqué comme non supporté nativement par les sources étudiées.
- **FR-054** : NexKit doit permettre de démarrer `squad watch`, voir son état, l'arrêter proprement, et afficher les erreurs.
- **FR-055** : NexKit doit proposer des actions rapides de cérémonies depuis `.squad/ceremonies.md`.
- **FR-056** : NexKit doit préparer un flux "worktree par issue" en phase ultérieure, avec conventions de branche et isolation.

### Épique G — Doctor, export/import, modèles, profils et personnel

- **FR-060** : NexKit doit exposer Squad Doctor et afficher les résultats structurés si disponibles, sinon parser un rapport texte minimal.
- **FR-061** : NexKit doit permettre `squad export` vers un fichier choisi ou dépôt GitHub si supporté.
- **FR-062** : NexKit doit permettre `squad import` avec prévisualisation, sauvegarde et confirmation.
- **FR-063** : NexKit doit afficher et éditer la configuration de modèles par agent (`.squad/model-config.json`).
- **FR-064** : NexKit doit supporter les scénarios personal squad (`squad init --global`) et consult mode, avec avertissements sur la portée locale/personnelle.
- **FR-065** : Les profils NexKit doivent pouvoir inclure une configuration Squad : preset choisi, upstreams, plugins Squad, paramètres de modèles et préférences Ralph.
- **FR-066** : NexKit doit émettre une télémétrie anonyme de parcours Squad, respectant les règles existantes et sans noms de fichiers, chemins, workspace, contenu utilisateur ou secrets.

## Exigences non fonctionnelles

- **Activation** : aucune détection lourde, aucun scan récursif et aucune exécution CLI ne doivent bloquer l'activation VS Code. Charger l'état Squad à l'ouverture du panneau ou sur demande.
- **Performance** : limiter les lectures initiales aux fichiers connus; paginer ou différer les logs/historiques volumineux; timeout strict pour CLI.
- **Cross-platform** : utiliser `vscode.Uri`, `path` natif et API VS Code; ne jamais concaténer des chemins à la main.
- **Sécurité** : ne jamais exécuter une commande issue d'un preset; seules les commandes Squad/GitHub/Azure explicitement supportées sont lancées avec arguments séparés.
- **Sauvegarde** : toute écriture sur `.squad/`, `.github/agents/`, `.github/workflows/`, `.copilot/` ou fichiers de configuration associés doit passer par `BackupService`.
- **Authentification** : réutiliser `GitHubAuthHelper` et les priorités existantes `GITHUB_TOKEN`/`GH_TOKEN` puis `vscode.authentication` avec scope `repo`.
- **Télémétrie** : respecter `nexkit.telemetry.enabled` et la télémétrie globale VS Code; anonymiser les événements Squad.
- **Paramètres** : tout accès aux settings doit passer par `SettingsManager`, jamais directement par `vscode.workspace.getConfiguration()`.
- **Résilience** : si CLI/gh/az sont absents, afficher un diagnostic actionnable sans état faussement réussi.
- **Accessibilité** : l'onglet Squad doit rester utilisable au clavier, avec états de chargement et erreurs lisibles.

## Architecture proposée

### Services extension

- `SquadDetectionService` : détecte installation, version projet, version CLI, disponibilité `gh`/`az`.
- `SquadCliService` : enveloppe l'exécution `squad`/`npx`, timeouts, streaming, codes d'erreur, commandes autorisées.
- `SquadFileService` : lit/écrit les fichiers `.squad/` avec types, validations et sauvegardes.
- `SquadPresetService` : découvre les presets `squad/` dans les plugins Nexus, incluant dépôts externes.
- `SquadUpstreamService` : lit `.squad/upstream.json` et orchestre les commandes `squad upstream`.
- `SquadPluginService` : lit `.squad/plugins/*`, orchestre `squad plugin`.
- `SquadBacklogService` : détecte GitHub/ADO, expose état Ralph et backlog.
- `SquadProfileService` : étend les profils NexKit pour inclure la configuration Squad.
- `SquadTelemetryService` ou extension de `TelemetryService` : événements anonymes Squad.

Tous les services doivent être enregistrés dans `src/core/serviceContainer.ts`.

### Fichiers et dossiers probables

- `src/features/squad-management/`
  - `squadDetectionService.ts`
  - `squadCliService.ts`
  - `squadFileService.ts`
  - `squadPresetService.ts`
  - `squadUpstreamService.ts`
  - `squadPluginService.ts`
  - `squadBacklogService.ts`
  - `squadProfileService.ts`
  - `types.ts`
  - `commands/`
- `src/features/panel-ui/webview/components/Squad/`
- `src/features/panel-ui/webview/hooks/useSquadData.ts`
- `src/features/panel-ui/webview/types/squadState.ts`
- Tests sous `test/suite/squad*.test.ts`.

### Messages webview

- `squad/getStatus`
- `squad/listPresets`
- `squad/initFromPreset`
- `squad/runDoctor`
- `squad/readFile`
- `squad/saveFile`
- `squad/listUpstreams`
- `squad/addUpstream`
- `squad/syncUpstream`
- `squad/removeUpstream`
- `squad/listPlugins`
- `squad/pluginAction`
- `squad/checkUpdates`
- `squad/upgradeCli`
- `squad/upgradeProject`
- `squad/export`
- `squad/import`
- `squad/startWatch`
- `squad/stopWatch`
- `squad/getWatchStatus`
- `squad/updateModelConfig`

Le routage doit rester centralisé dans `nexkitPanelMessageHandler.ts`; aucun composant ne doit ajouter son propre listener global.

### Settings proposés

- `nexkit.squad.cliPath` : chemin optionnel du CLI Squad.
- `nexkit.squad.useNpxFallback` : autoriser `npx @bradygaster/squad-cli`.
- `nexkit.squad.marketplaceRepo` : défaut `NexusInnovation/nexus-plugin-marketplace`.
- `nexkit.squad.enableTelemetry` : sous-contrôle Squad, combiné avec le contrôle global.
- `nexkit.squad.watch.defaultIntervalMinutes`.
- `nexkit.squad.backupBeforeOperations` : défaut `true`, non désactivable pour opérations destructives.

### Commandes VS Code proposées

- `nexkit.squad.refresh`
- `nexkit.squad.initFromPreset`
- `nexkit.squad.runDoctor`
- `nexkit.squad.checkUpdates`
- `nexkit.squad.upgradeProject`
- `nexkit.squad.export`
- `nexkit.squad.import`
- `nexkit.squad.startWatch`
- `nexkit.squad.stopWatch`

## Contrat du preset Squad Nexus

Chaque plugin d'équipe peut fournir un sous-dossier réservé :

```text
plugins/{plugin-id}/
  plugin.json
  squad/
    manifest.json
    team.md
    routing.md
    decisions.md
    ceremonies.md
    model-config.json
    agents/
      {agent-id}/
        charter.md
        history.md
    skills/
      {skill-id}/
        SKILL.md
    identity/
      now.md
      wisdom.md
    casting/
      policy.json
      registry.json
```

### `manifest.json`

```json
{
  "schemaVersion": 1,
  "id": "team-firebolt",
  "displayName": "Firebolt Squad",
  "description": "Preset Squad pour l'équipe Firebolt.",
  "squadCliVersion": ">=0.13.0",
  "level": "team",
  "source": {
    "type": "marketplace-plugin",
    "pluginId": "firebolt"
  },
  "files": {
    "required": [
      "team.md",
      "routing.md",
      "agents/*/charter.md"
    ],
    "optional": [
      "decisions.md",
      "ceremonies.md",
      "model-config.json",
      "skills/**",
      "identity/**",
      "casting/**"
    ]
  },
  "upstreams": [],
  "plugins": [],
  "recommendedBacklog": ["github", "azure-devops"]
}
```

### Règles du contrat

- Les chemins doivent être relatifs à `squad/`.
- Aucun fichier exécutable, script ou commande d'installation ne doit être requis.
- Les fichiers Markdown peuvent contenir des placeholders documentés, par exemple `{{projectName}}`, `{{repositoryOwner}}`, `{{repositoryName}}`.
- Les secrets, tokens, chemins locaux personnels et noms de workspace sont interdits.
- NexKit doit valider le manifest et refuser tout chemin absolu, traversal `..`, symlink ou extension dangereuse.
- `history.md` peut être fourni vide; NexKit ne doit jamais inventer d'historique.
- Pour `greffondors`, NexKit doit résoudre le dépôt externe déclaré par le plugin avant de chercher `squad/`. Si le dépôt est privé, réutiliser l'authentification GitHub existante.

## Phases

### MVP — Initialisation et panneau lecture seule

- Détection Squad projet/CLI.
- Découverte des presets `squad/`.
- Initialisation depuis preset ou CLI standard.
- Onglet Squad avec statut, roster, charters, décisions, routing, upstreams et plugins en lecture seule.
- Squad Doctor.
- Sauvegardes avant opérations.

### P2 — Édition contrôlée et mises à jour

- Édition charters, decisions, routing, model config.
- Détection et application confirmée des upgrades CLI/projet.
- Export/import avec prévisualisation.
- Upstream add/sync/remove.
- Plugins marketplace add/list/install/enable/disable.

### P3 — Ralph, backlog et profils

- GitHub Issues et Azure DevOps v1.
- Start/stop/status Ralph watch.
- Cérémonies one-click.
- Profils NexKit incluant Squad.
- Télémétrie anonyme Squad.

### P4 — Productivité avancée

- Personal squad et consult mode complets.
- Worktree par issue.
- Vue logs avancée et recherche.
- GitHub Projects si Squad le stabilise.
- Jira si support natif ou intégration validée.

## Risques et questions ouvertes

- `squad upstream` semble cloner un dépôt git complet; le support de sous-chemin n'est pas confirmé. Risque pour une marketplace monorepo avec dossiers réservés par niveau.
- `squad doctor --json` est annoncé dans l'aide, mais la disponibilité réelle doit être vérifiée avant dépendance forte.
- Les commandes CLI Squad évoluent vite; Squad est alpha. NexKit doit isoler les appels et gérer les versions.
- Le téléchargement récursif GitHub existe seulement pour `skills`; il faut généraliser sans casser les installations existantes.
- Les formats `.squad/` peuvent changer; les écritures directes doivent rester limitées aux fichiers Markdown/JSON stables.
- `squad watch` est un processus long : il faut gérer cycle de vie, annulation, logs, redémarrage et fermeture VS Code.
- Azure DevOps nécessite `az` et parfois extensions; NexKit doit diagnostiquer sans gérer tous les scénarios d'entreprise.
- Personal squad touche des dossiers utilisateur hors workspace; l'UX doit être explicite et prudente.

## Critères d'acceptation

- Un dépôt sans Squad affiche l'onglet Squad avec état "non installé" et actions d'initialisation.
- Un dépôt avec Squad affiche version, roster, charters, decisions, routing et diagnostics sans exécuter d'opération d'écriture.
- Si le CLI Squad est absent, NexKit propose installation globale, fallback `npx` ou chemin personnalisé.
- Une initialisation depuis preset crée les fichiers Squad attendus après confirmation et sauvegarde si nécessaire.
- Un upgrade projet ne s'exécute jamais sans confirmation et sauvegarde préalable.
- Les presets sont découverts dans `squad/` des plugins locaux et dans le dépôt externe `greffondors` si accessible.
- Les erreurs CLI sont visibles, actionnables et ne produisent pas d'état de succès.
- Les settings Squad passent par `SettingsManager`.
- Les tests couvrent détection, lecture de version, validation de preset, routage webview et commandes CLI simulées.
- La télémétrie ne contient aucun chemin, nom de fichier, workspace, contenu utilisateur ou secret.

## Work items proposés

| ID | Titre | Épique | Phase | Agent suggéré | Dépendances | Estimation (h) |
| --- | --- | --- | --- | --- | --- | --- |
| SQD-001 | Créer les types de domaine Squad | Architecture | MVP | Morpheus | Aucune | 4 |
| SQD-002 | Ajouter les settings Squad dans SettingsManager | Architecture | MVP | Link | SQD-001 | 3 |
| SQD-003 | Enregistrer les services Squad dans ServiceContainer | Architecture | MVP | Link | SQD-001 | 3 |
| SQD-004 | Implémenter SquadDetectionService | Détection | MVP | Link | SQD-001 | 6 |
| SQD-005 | Implémenter SquadCliService avec timeouts et commandes autorisées | Détection | MVP | Link | SQD-002 | 8 |
| SQD-006 | Lire la version projet depuis squad.agent.md | Détection | MVP | Link | SQD-004 | 3 |
| SQD-007 | Concevoir l'état webview Squad dans AppState | UI | MVP | Ghost | SQD-001 | 5 |
| SQD-008 | Ajouter le routage messages Squad dans nexkitPanelMessageHandler | UI | MVP | Link | SQD-003, SQD-007 | 6 |
| SQD-009 | Créer l'onglet Squad dans le panneau NexKit | UI | MVP | Ghost | SQD-007, SQD-008 | 8 |
| SQD-010 | Afficher statut, versions et diagnostics CLI | UI | MVP | Ghost | SQD-004, SQD-005, SQD-009 | 5 |
| SQD-011 | Implémenter SquadFileService en lecture seule | Fichiers Squad | MVP | Link | SQD-001 | 8 |
| SQD-012 | Afficher roster et agents depuis team.md et charters | UI | MVP | Ghost | SQD-011 | 6 |
| SQD-013 | Afficher decisions.md et routing.md | UI | MVP | Ghost | SQD-011 | 4 |
| SQD-014 | Afficher historiques et logs en lecture seule avec limite de taille | UI | MVP | Ghost | SQD-011 | 5 |
| SQD-015 | Définir le validateur de contrat preset squad/ | Presets | MVP | Link | SQD-001 | 7 |
| SQD-016 | Généraliser le téléchargement récursif GitHub au dossier squad/ | Presets | MVP | Link | SQD-015 | 8 |
| SQD-017 | Résoudre les presets depuis plugins locaux de la marketplace Nexus | Presets | MVP | Link | SQD-015, SQD-016 | 7 |
| SQD-018 | Résoudre les presets depuis le repo externe greffondors | Presets | MVP | Link | SQD-017 | 6 |
| SQD-019 | Créer l'écran de sélection de preset Squad | UI | MVP | Ghost | SQD-017 | 6 |
| SQD-020 | Implémenter init depuis preset avec sauvegarde préalable | Initialisation | MVP | Link | SQD-005, SQD-015, SQD-019 | 10 |
| SQD-021 | Exposer Squad Doctor dans l'onglet | Doctor | MVP | Link | SQD-005, SQD-009 | 6 |
| SQD-022 | Ajouter tests unitaires détection et version | Tests | MVP | Trinity | SQD-004, SQD-006 | 5 |
| SQD-023 | Ajouter tests unitaires validation preset | Tests | MVP | Trinity | SQD-015 | 5 |
| SQD-024 | Ajouter tests webview pour affichage lecture seule | Tests | MVP | Trinity | SQD-009, SQD-012, SQD-013 | 8 |
| SQD-025 | Ajouter diagnostics d'absence CLI avec choix npm/npx/chemin | Détection | MVP | Ghost | SQD-005, SQD-010 | 5 |
| SQD-026 | Implémenter écritures contrôlées charters avec BackupService | Édition | P2 | Link | SQD-011 | 7 |
| SQD-027 | Implémenter édition decisions.md et routing.md | Édition | P2 | Link | SQD-026 | 6 |
| SQD-028 | Implémenter édition model-config.json | Modèles | P2 | Link | SQD-026 | 5 |
| SQD-029 | Créer UI d'édition charters/décisions/routing | UI | P2 | Ghost | SQD-026, SQD-027 | 10 |
| SQD-030 | Implémenter détection updates CLI et projet | Updates | P2 | Link | SQD-005 | 7 |
| SQD-031 | Implémenter upgrade CLI confirmé | Updates | P2 | Link | SQD-030 | 6 |
| SQD-032 | Implémenter upgrade projet confirmé avec sauvegarde | Updates | P2 | Link | SQD-030 | 8 |
| SQD-033 | Implémenter export Squad | Export/Import | P2 | Link | SQD-005 | 5 |
| SQD-034 | Implémenter import Squad avec preview et backup | Export/Import | P2 | Link | SQD-033 | 8 |
| SQD-035 | Lire et afficher upstream.json | Upstream | P2 | Link | SQD-011 | 5 |
| SQD-036 | Ajouter/sync/remove upstream via CLI | Upstream | P2 | Link | SQD-005, SQD-035 | 8 |
| SQD-037 | Ajouter recommandations org/team/project et avertissement subpath | Upstream | P2 | Morpheus | SQD-035 | 4 |
| SQD-038 | Lire marketplaces et plugins Squad | Plugins | P2 | Link | SQD-011 | 6 |
| SQD-039 | Implémenter actions plugin marketplace et lifecycle | Plugins | P2 | Link | SQD-005, SQD-038 | 9 |
| SQD-040 | Créer UI upstreams et plugins | UI | P2 | Ghost | SQD-036, SQD-039 | 10 |
| SQD-041 | Couvrir tests commandes CLI simulées | Tests | P2 | Trinity | SQD-030, SQD-036, SQD-039 | 8 |
| SQD-042 | Détecter backlog GitHub Issues | Backlog | P3 | Link | SQD-005 | 6 |
| SQD-043 | Détecter backlog Azure DevOps et config ado | Backlog | P3 | Link | SQD-042 | 8 |
| SQD-044 | Afficher statut backlog GitHub/ADO | UI | P3 | Ghost | SQD-042, SQD-043 | 6 |
| SQD-045 | Démarrer et arrêter squad watch | Ralph | P3 | Link | SQD-005 | 8 |
| SQD-046 | Afficher santé et logs de squad watch | Ralph | P3 | Ghost | SQD-045 | 7 |
| SQD-047 | Ajouter actions rapides de cérémonies | Cérémonies | P3 | Ghost | SQD-011 | 6 |
| SQD-048 | Étendre les profils NexKit avec configuration Squad | Profils | P3 | Link | SQD-001, SQD-017, SQD-035, SQD-038 | 10 |
| SQD-049 | Ajouter télémétrie anonyme Squad | Télémétrie | P3 | Link | SQD-048 | 5 |
| SQD-050 | Ajouter tests intégration profils Squad | Tests | P3 | Trinity | SQD-048 | 7 |
| SQD-051 | Ajouter scénario personal squad | Personal/Consult | P4 | Link | SQD-005, SQD-011 | 8 |
| SQD-052 | Ajouter scénario consult mode | Personal/Consult | P4 | Link | SQD-051 | 7 |
| SQD-053 | Concevoir flux worktree par issue | Worktree | P4 | Morpheus | SQD-042, SQD-043 | 5 |
| SQD-054 | Implémenter worktree par issue | Worktree | P4 | Link | SQD-053 | 12 |
| SQD-055 | Ajouter garde CI/lint pour les tests Squad | CI | P4 | Tank | SQD-022, SQD-041, SQD-050 | 6 |
