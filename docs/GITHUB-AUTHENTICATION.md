# Configuration GitHub pour NexKit : Authentification et Limites de Taux

> **Résumé** : Ce guide explique comment configurer l'authentification GitHub pour NexKit afin d'augmenter votre limite de requêtes API et optimiser la récupération des templates IA.

## 📊 Limites de Taux (API Rate Limits)

### Comparaison : Authentifié vs Non-authentifié

| Métrique | Non-authentifié | Authentifié |
|----------|------------------|-------------|
| **Requêtes par heure** | 60 | 5,000 |
| **Autorisation** | Non requis | Requis |
| **Type d'utilisation** | Lecture simple | Accès continu |
| **Cas d'usage** | Lecture occasionnelle | Production & développement |

### Ce que cela signifie pour NexKit

Quand NexKit récupère des templates depuis les dépôts GitHub :

- **Sans authentification** : Limite de 60 appels API par heure
- **Avec authentification** : Limite de 5,000 appels API par heure

Cela représente une augmentation de **~83 fois** plus de requêtes disponibles !

## 🔓 Pourquoi Authentifier ?

### Limites Sans Authentification

- ❌ Récupération lente de templates avec plusieurs dépôts
- ❌ Erreurs `403 Forbidden` si limite atteinte
- ❌ Impossible d'accéder à certains dépôts privés
- ❌ Performances dégradées en équipe

### Avantages Avec Authentification

- ✅ Récupération rapide de templates
- ✅ Accès à des dépôts privés
- ✅ Performance stable en équipe
- ✅ Moins d'erreurs de dépassement de limite
- ✅ Meilleure expérience utilisateur

## 🔐 Configuration de l'Authentification GitHub

### Méthode 1 : Authentification Intégrée VS Code (Recommandée)

C'est la méthode la plus simple et la plus sécurisée. VS Code gère automatiquement l'authentification.

#### Étapes

1. **Ouvrir VS Code**
   - Démarrez l'extension NexKit normalement

2. **Accéder aux Paramètres des Comptes**
   - Cliquez sur l'icône **Comptes** dans la barre d'activité (bas-gauche)
   - Ou utilisez la palette de commandes : `Ctrl+Shift+P` → tapez "Accounts: Show Accounts View"

3. **Ajouter un Compte GitHub**
   - Cliquez sur le bouton **"Sign in with GitHub"** ou **"+"**
   - Sélectionnez **"GitHub"**
   - VS Code ouvre une page d'authentification GitHub dans votre navigateur

4. **Autoriser VS Code**
   - Une fenêtre GitHub apparaît
   - Cliquez sur **"Authorize github"** (ou le bouton similaire)
   - Approuvez les permissions (accès en lecture aux dépôts privés)
   - GitHub redirige vers VS Code avec un message de confirmation

5. **Vérifier la Connexion**
   - Vous verrez votre nom de compte GitHub dans la section Comptes
   - L'authentification est maintenant active

#### Capture d'Écran (Flux Attendu)

```
VS Code
  ↓
Barre d'activité (gauche) → Icône Comptes (personne)
  ↓
"Sign in with GitHub"
  ↓
Navigateur → Page d'authentification GitHub
  ↓
"Authorize github"
  ↓
Redirigé vers VS Code ✓ Connecté
```

### Méthode 2 : Authentification via Palette de Commandes

Pour les utilisateurs avancés, vous pouvez déclencher l'authentification directement :

```bash
# Ouvrir la palette de commandes
Ctrl+Shift+P (Windows/Linux)
Cmd+Shift+P (macOS)

# Taper
> GitHub: Sign in

# Ou rechercher
> Accounts
```

### Méthode 3 : Personal Access Token (Pour les Cas Avancés)

Si l'authentification intégrée ne fonctionne pas, vous pouvez utiliser un Personal Access Token (PAT) :

#### Créer un Personal Access Token

1. Accédez à GitHub.com et connectez-vous à votre compte
2. Allez dans **Settings → Developer settings → Personal access tokens → Tokens (classic)**
3. Cliquez sur **"Generate new token (classic)"**
4. Donnez un nom au token : `nexkit-vs-code`
5. Sélectionnez les scopes (permissions) :
   - ✅ `repo` (lecture des dépôts privés et publics)
   - ✅ `read:org` (lecture des organisations)
6. Cliquez sur **"Generate token"**
7. **Copiez le token** (apparaît une seule fois !)

#### Utiliser le Token

Sur Windows avec PowerShell :

```powershell
# Définir la variable d'environnement pour VS Code
[System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'ghp_YOUR_TOKEN_HERE', 'User')

# Redémarrer VS Code pour que le changement prenne effet
```

Sur Linux/macOS :

```bash
# Ajouter à ~/.bashrc ou ~/.zshrc
export GITHUB_TOKEN='ghp_YOUR_TOKEN_HERE'

# Redémarrer VS Code
```

## ✅ Vérifier que l'Authentification Fonctionne

### Dans VS Code

1. **Section Comptes**
   - Vous verrez votre username GitHub avec un symbole ✓

2. **Message de Confirmation**
   - Ouvrez la palette de commandes : `Ctrl+Shift+P`
   - Tapez "Nexkit: Check GitHub Authentication Status"
   - Message attendu : `✓ Authenticated with GitHub`

### Via Test Manual

1. Ouvrez un dépôt GitHub privé dans NexKit
2. La récupération des templates devrait fonctionner sans erreur
3. Pas de messages d'erreur `403 Forbidden`

### Via Logs

1. Ouvrir la palette de commandes : `Ctrl+Shift+P`
2. Taper "Developer: Toggle Developer Tools"
3. Aller dans l'onglet **Console**
4. Les logs de NexKit affichent : `[Templates] GitHub API request starting` avec un header `Authorization: ******

## 🔄 Cycle de Vie de l'Authentification

### Token Lifespan

- **Session Token** : Valide tant que vous êtes connecté à VS Code
- **Refresh Automatique** : VS Code gère automatiquement le renouvellement
- **Expiration** : Les tokens ne s'expirent que si vous vous déconnectez

### Révoquer l'Accès

Pour révoquer l'accès de VS Code à GitHub :

1. Allez dans GitHub.com → **Settings → Applications → Authorized OAuth Apps**
2. Trouvez **Visual Studio Code** dans la liste
3. Cliquez sur **"Revoke"**
4. Confirmez la révocation

Pour VS Code :
1. Section Comptes
2. Cliquez sur le compte GitHub
3. Sélectionnez **"Remove Account"** ou l'icône ⋮

## 🚨 Dépannage

### Problème : "Authentication Failed"

**Cause** : Authentification non configurée ou token expiré

**Solution** :
1. Ouvrez la palette de commandes : `Ctrl+Shift+P`
2. Tapez `> GitHub: Sign Out`
3. Puis tapez `> GitHub: Sign in`
4. Suivez le flux d'authentification

### Problème : "Rate Limit Exceeded" (403)

**Avant** : Vous aviez une limite de 60/h (non-authentifié)

**Solution** :
1. Vérifiez que vous êtes authentifié (voir section "Vérifier" ci-dessus)
2. Attendez 1 heure que la limite se réinitialise
3. Essayez à nouveau

**Cause racine** : Authentification non active malgré la configuration

### Problème : Token Invalide

**Cause** : Token expiré ou mal formé

**Solution** :
1. Si vous utilisez un PAT :
   - Générez un nouveau token en suivant "Méthode 3" ci-dessus
   - Mettez à jour la variable d'environnement `GITHUB_TOKEN`
   - Redémarrez VS Code

2. Si vous utilisez l'authentification VS Code :
   - Reconnectez-vous via la section Comptes

### Problème : Accès Refusé à un Dépôt Privé (401)

**Cause** : Les permissions du token/compte sont insuffisantes

**Solutions** :
1. **Si vous utilisez PAT** : Vérifiez que le scope `repo` est coché
2. **Si vous utilisez VS Code** : Vérifiez que l'organisation a autorisé l'accès SSO
3. **Vérifiez vos permissions** : 
   - Avez-vous accès au dépôt privé sur GitHub.com directement ?
   - Demandez à l'administrateur du dépôt d'ajouter votre compte

### Problème : "Accounts: VS Code is Unable to Connect to GitHub"

**Cause** : Firewall ou politique réseau bloque l'accès à GitHub.com

**Solution** :
1. Vérifiez que votre réseau autorise les connexions sortantes vers `github.com`
2. Consultez votre administrateur réseau/firewall
3. Utilisez un réseau différent pour tester
4. Alternative : Utilisez un Personal Access Token (PAT) avec proxy si configuré

## 📈 Optimisation de l'Utilisation de l'API

### Bonnes Pratiques

#### ✅ À Faire

- Authentifiez-vous avant d'utiliser NexKit en production
- Gardez votre token GitHub sécurisé (ne jamais le commiter)
- Testez localement avec quelques dépôts avant de scaler
- Utilisez la caching local pour réduire les appels API

#### ❌ À Éviter

- Ne partagez jamais votre PAT ou token
- N'incluez pas les tokens dans les scripts publics
- Ne régénérez pas le token sans raison valide
- Ne désactivez pas l'authentification en production

### Caching et Performance

NexKit cache les templates localement pour réduire les appels API :

- **Cache d'Activation** : Templates en cache au démarrage
- **Cache de Référentiel** : Mises à jour toutes les heures
- **Cache Local** : Sauvegarde dans `.nexkit/`

Pour forcer une actualisation :
1. Palette de commandes : `Ctrl+Shift+P`
2. Tapez "Nexkit: Refresh Templates"
3. Les templates se rechargent depuis GitHub

## 🔗 Ressources Connexes

- [Documentation Officielle GitHub Authentication](https://docs.github.com/en/authentication)
- [Personal Access Tokens (PAT)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [VS Code GitHub Authentication](https://code.visualstudio.com/docs/editor/github)
- [Rate Limiting API GitHub](https://docs.github.com/en/rest/overview/rate-limits-for-the-rest-api)

## ❓ Questions Fréquentes (FAQ)

### Q : Puis-je utiliser l'authentification GitHub pour les dépôts publics ?

**R :** Oui ! Même pour les dépôts publics, l'authentification augmente vos limites API de 60 à 5,000 requêtes/heure.

### Q : Mon token/authentication est-il stocké en local ?

**R :** 
- **VS Code** : Stocké dans le keystore du système (Windows Credential Manager, macOS Keychain, etc.)
- **PAT** : Stocké dans la variable d'environnement (ne jamais commiter dans le code)

### Q : Que se passe-t-il si j'atteins 5,000 requêtes/heure ?

**R :** NexKit affichera un message d'erreur `Rate limit exceeded`. Attendez l'heure suivante (limite réinitialisée à minuit UTC).

Pour les cas critiques, contactez GitHub pour demander une augmentation de limite.

### Q : L'authentification fonctionne-t-elle hors ligne ?

**R :** Non. L'authentification nécessite une connexion Internet pour vérifier les permissions avec GitHub.

### Q : Comment désactiver l'authentification ?

**R :** 
1. Allez dans la section Comptes
2. Cliquez sur votre compte GitHub
3. Sélectionnez "Remove Account" ou "Sign Out"

NexKit continuera de fonctionner, mais avec un limite de 60 requêtes/heure.

### Q : NexKit sauvegarde-t-il mon mot de passe ?

**R :** Non. NexKit utilise OAuth et les tokens — jamais les mots de passe. VS Code gère les secrets de manière sécurisée via le keystore système.

---

## 📞 Support

Pour des problèmes d'authentification :

1. **Vérifiez les logs** : Developer Tools → Console
2. **Consultez les Issues** : [GitHub Issues](https://github.com/NexusInnovation/nexus-nexkit-vscode/issues)
3. **Posez une question** : [GitHub Discussions](https://github.com/NexusInnovation/nexus-nexkit-vscode/discussions)

---

**Dernière mise à jour** : juillet 2026  
**Applicable à** : NexKit v3.0+ avec support GitHub OAuth
