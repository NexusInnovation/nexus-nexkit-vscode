# Fix: Nexkit Telemetry Not Reporting in Application Insights

## Work Item

- **ID:** (not provided)

## Context

Nexkit envoie des événements de télémétrie via Application Insights depuis le service central [src/shared/services/telemetryService.ts](src/shared/services/telemetryService.ts), initialisé pendant l'activation de l'extension via [src/core/serviceContainer.ts](src/core/serviceContainer.ts). L'événement de démarrage est émis par `trackActivation()` juste après `initialize()`.

Le signal utilisateur indique qu'aucune télémétrie récente n'apparaît dans Application Insights depuis plus d'une semaine en local, y compris l'événement attendu au démarrage avec la version de l'extension. Le dernier signal observé côté App Insights est en version 3.10.0.

## Bug Description

**Comportement observé :**
- Plus de télémétrie Nexkit visible dans Application Insights depuis plus d'une semaine.
- Même le démarrage de Nexkit ne produit pas d'événement visible.
- La dernière version observée dans la télémétrie est 3.10.0.

**Comportement attendu :**
- Au moins une entrée de télémétrie à chaque démarrage de Nexkit.
- La propriété de version doit refléter la version courante de l'extension.

**Reproduction minimale (locale) :**
1. Démarrer VS Code avec Nexkit activé.
2. Vérifier dans App Insights les événements de démarrage récents.
3. Constater l'absence d'événements récents.

## Root Cause

La régression est cohérente avec la migration récente du package Application Insights vers la version 3.x, alors que Nexkit conserve un modèle d'initialisation global basé sur setup/start + defaultClient dans [src/shared/services/telemetryService.ts](src/shared/services/telemetryService.ts).

Le client est créé dans un process Extension Host partagé avec d'autres extensions. En mode global, la configuration de providers OpenTelemetry peut être influencée par l'environnement du process, ce qui rend l'acheminement de la télémétrie Nexkit fragile ou silencieusement dégradé. Dans ce contexte, l'événement de démarrage continue d'être appelé depuis [src/core/serviceContainer.ts](src/core/serviceContainer.ts), mais n'apparaît plus côté App Insights.

Deux facteurs aggravants rendent le diagnostic difficile :
- Le service ne publie pas assez de logs structurés en sortie Nexkit quand l'initialisation télémétrie échoue ou est désactivée.
- Le mode d'envoi immédiat très agressif (batch interval à 0) augmente le risque de comportements non déterministes avec la stack 3.x.

## Implementation Steps

### Step 1: Remplacer l'initialisation globale App Insights par un client isolé Nexkit

Dans [src/shared/services/telemetryService.ts](src/shared/services/telemetryService.ts), remplacer l'initialisation setup/start + defaultClient par une instanciation explicite de TelemetryClient avec la connection string Nexkit, en mode isolé des providers globaux du process.

Le service doit continuer à envoyer les mêmes événements fonctionnels (activation, commande, erreur, métriques), mais sans dépendre de l'état global OpenTelemetry du host partagé.

**Expected observable result:** Le démarrage Nexkit produit à nouveau des événements visibles dans App Insights de manière stable, même quand d'autres extensions chargent leur propre instrumentation.

**Risks and constraints:** Conserver la compatibilité des méthodes publiques existantes du service de télémétrie et ne pas modifier l'API utilisée par les autres services.

### Step 2: Normaliser la configuration de transport pour la version 3.x

Dans [src/shared/services/telemetryService.ts](src/shared/services/telemetryService.ts), remplacer la configuration de flush agressive actuelle par des paramètres de batch compatibles et raisonnables pour la version 3.x. Éviter les valeurs extrêmes qui peuvent provoquer des pertes silencieuses ou un comportement instable.

Le service doit garantir un flush explicite lors des événements critiques (activation, erreurs, désactivation), sans forcer un intervalle global non supporté.

**Expected observable result:** Les événements de démarrage remontent de façon régulière et l'envoi est plus prédictible.

**Risks and constraints:** Ne pas augmenter excessivement le volume réseau; conserver une latence acceptable pour la visibilité opérationnelle.

### Step 3: Ajouter un diagnostic détaillé en Output Nexkit pour la télémétrie

Dans [src/shared/services/telemetryService.ts](src/shared/services/telemetryService.ts) et via [src/shared/services/loggingService.ts](src/shared/services/loggingService.ts), ajouter des messages de diagnostic explicites pour chaque état clé :
- télémétrie désactivée par configuration utilisateur;
- télémétrie désactivée par niveau global VS Code;
- absence de connection string;
- initialisation réussie (avec version extension et mode de transport);
- échec d'initialisation (message d'erreur synthétique + cause).

Ces messages doivent être utiles pour investiguer rapidement un incident local sans devoir ouvrir le code.

**Expected observable result:** En cas de panne, le canal Output Nexkit indique immédiatement pourquoi aucun événement n'est envoyé.

**Risks and constraints:** Ne pas exposer de secrets ni la connection string complète dans les logs; éviter toute donnée personnelle sensible.

### Step 4: Ajouter un événement de santé de télémétrie au démarrage

Dans [src/shared/services/telemetryService.ts](src/shared/services/telemetryService.ts), ajouter un événement de santé simple émis à l'initialisation réussie (distinct de l'événement activation fonctionnel) avec propriétés minimales : version extension, sessionId, état des toggles de télémétrie.

Cet événement sert d'indicateur d'observabilité pour différencier un problème d'activation métier et un problème de pipeline télémétrie.

**Expected observable result:** App Insights montre un signal de santé identifiable dès le démarrage de chaque session.

**Risks and constraints:** Garder la cardinalité des propriétés faible et stable pour ne pas dégrader l'analyse dans App Insights.

### Step 5: Ajouter des tests unitaires ciblés sur la panne et le diagnostic

Dans [test/suite/telemetryService.test.ts](test/suite/telemetryService.test.ts), ajouter des tests qui valident :
- l'activation de la télémétrie quand les settings sont permissifs;
- la non initialisation quand telemetryLevel est off;
- la présence de logs de diagnostic attendus pour succès et échec;
- l'émission de l'événement de démarrage après initialisation réussie.

**Expected observable result:** Une régression similaire est détectée automatiquement en test avant livraison.

**Risks and constraints:** Éviter les tests dépendants du réseau externe; utiliser des stubs/mocks pour le client télémétrie et la résolution d'IP.

## Documentation Updates

- Update [docs/architecture.md](docs/architecture.md)
  Section à modifier: partie services transverses / observabilité.
  Contenu: préciser que la télémétrie Nexkit utilise un client isolé par extension et documenter les états de diagnostic exposés dans le canal Output Nexkit.

- Update [docs/development-guide.md](docs/development-guide.md)
  Section à modifier: debugging et troubleshooting.
  Contenu: ajouter une procédure courte pour diagnostiquer une absence de signal App Insights (vérification des logs Output Nexkit, settings télémétrie, puis validation App Insights).

- No new documentation page required
  Justification: la correction est interne au pipeline d'observabilité et n'introduit ni nouveau flux utilisateur, ni nouveau module métier justifiant une page Feature, Module ou UserScenario dédiée.

## Manual Test Plan

### TC-1: Vérifier le signal de démarrage et le diagnostic en cas d'échec télémétrie

**Why:** Valide en une seule exécution que Nexkit envoie bien un événement de startup avec la bonne version et qu'un diagnostic lisible est affiché si la télémétrie ne peut pas partir.

**Preconditions:** Extension Nexkit compilée avec le correctif; accès au canal Output Nexkit; accès lecture App Insights de l'environnement cible.

**Steps:**

1. Activer la télémétrie Nexkit et conserver le niveau global VS Code autorisant la télémétrie, puis lancer une nouvelle session Extension Development Host.
	- **Expected:** Le canal Output Nexkit affiche un message d'initialisation télémétrie réussie avec la version courante.
2. Observer App Insights pour la session lancée.
	- **Expected:** Un événement de santé de télémétrie et un événement d'activation sont visibles, avec la version courante (pas 3.10.0 si la version locale est différente).
3. Simuler un échec de pipeline télémétrie (par exemple via une connection string invalide de test ou un mode de blocage réseau contrôlé), puis relancer une session.
	- **Expected:** Le canal Output Nexkit affiche clairement l'état d'échec et la cause synthétique, sans fuite de secret.
4. Réactiver la configuration correcte et relancer une session.
	- **Expected:** Le signal de startup réapparaît dans App Insights et le diagnostic repasse en mode succès.

**Expected result:** Le démarrage Nexkit est observable en continu dans App Insights, et toute panne de télémétrie est immédiatement explicable via l'Output Nexkit.