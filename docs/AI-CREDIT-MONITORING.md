# Configuration du Suivi des Crédits IA dans NexKit

> **Guide Complet** : Ce document explique comment configurer NexKit pour afficher la consommation de crédits IA (GitHub Copilot) et comment les organisations peuvent distribuer des credentials de façon sécurisée.

## 📊 Vue d'Ensemble

NexKit affiche votre consommation mensuelle de crédits IA directement dans la barre d'état VS Code. Les données affichées incluent :

- ✅ **Crédits Inclus** : Crédits fournis avec votre licence GitHub Copilot
- ✅ **Crédits Additionnels** : Crédits achetés en supplément
- ✅ **Total Consommé** : Montant total en USD (1 crédit = 0.01 USD)
- ✅ **Période** : Mois en cours (format YYYY-MM)

### Exemple d'Affichage

```
💳 Copilot: $12.50 (100 inc + 150 add) | 2026-01
```

## 🔐 Comment Cela Fonctionne (Architecture Sécurisée)

### Flux d'Authentification

```
┌─────────────────────────────────────────────────────────────┐
│ NexKit (Extension VS Code)                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ VS Code SecretStorage (Chiffré localement)                  │
│ - GitHub PAT avec scope 'billing'                           │
│ - Stocké sécurisé dans le Credential Manager du système    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ GitHub API (https://api.github.com)                         │
│ GET /user/billing/ai_credit/usage                           │
│ Headers: Authorization: ******                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ Affichage dans la Barre d'État de VS Code                   │
│ 💳 Copilot: $12.50 (100 inc + 150 add)                      │
└─────────────────────────────────────────────────────────────┘
```

### Points de Sécurité Clés

- ✅ **Stockage Local** : Le token n'est JAMAIS transmis ailleurs qu'à GitHub
- ✅ **Chiffrement** : Stocké via VS Code SecretStorage (Credential Manager Windows, Keychain macOS, etc.)
- ✅ **Isolation** : Chaque utilisateur a son propre token et ses propres données
- ✅ **Pas de Télémétrie** : Les données de facturation ne sont jamais envoyées à Nexus Innovation
- ✅ **Révocation** : Vous pouvez révoquer le token n'importe quand

## 🚀 Configuration Utilisateur (Étapes Simples)

### Prérequis

- ✅ GitHub Copilot actif sur votre compte (licence individuelle ou d'organisation)
- ✅ VS Code 1.105.0 ou supérieur
- ✅ Connexion Internet

### Étape 1 : Créer un Personal Access Token (PAT)

Un Personal Access Token (PAT) est une clé d'authentification sécurisée pour accéder à l'API GitHub.

#### Sur GitHub.com

1. Connectez-vous à **github.com**
2. Allez dans **Settings → Developer settings → Personal access tokens → Tokens (classic)**
   - Lien direct : https://github.com/settings/tokens
3. Cliquez sur **"Generate new token (classic)"**

#### Configuration du Token

1. **Donnez un nom au token**
   ```
   NexKit AI Credit Monitoring
   ```

2. **Sélectionnez l'expiration**
   - Recommandé : **No expiration** (pas d'expiration)
   - Ou 90 jours pour plus de sécurité

3. **Sélectionnez UNIQUEMENT ce scope**
   ```
   ☑ (select all) - NON, au lieu de cela sélectionnez :
   ☑ user:billing
   ```

4. **Générateur le token**
   - Cliquez sur **"Generate token"** en bas

5. **Copiez le token**
   - Le token n'apparaîtra qu'une seule fois
   - Format : `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **NE JAMAIS le partager ou le commiter**

### Étape 2 : Configurer NexKit

#### Via les Commandes

1. **Ouvrez la palette de commandes**
   ```
   Ctrl+Shift+P (Windows/Linux)
   Cmd+Shift+P (macOS)
   ```

2. **Tapez la commande**
   ```
   Nexkit: Open AI Credit Settings
   ```

3. **Sélectionnez une action**
   ```
   > Add/Update Billing Token
   ```

4. **Entrez votre token**
   - Collez le PAT créé à l'étape 1
   - Le champ est caché (password input) par sécurité
   - Appuyez sur Entrée

5. **Vérification**
   - Message : `"Billing token stored and usage refreshed"`
   - La barre d'état affiche : `💳 Copilot: $X.XX ...`

#### Via les Paramètres VS Code

1. **Ouvrir Paramètres**
   ```
   Ctrl+, (Windows/Linux)
   Cmd+, (macOS)
   ```

2. **Rechercher "nexkit.aiCredit"**
   - Il n'y a pas de paramètre visuel (stockage via SecretStorage)

3. **Utiliser la commande pour gérer**

### Étape 3 : Vérifier le Fonctionnement

#### Barre d'État

- Regardez le **coin inférieur droit** de VS Code
- Vous devriez voir : `💳 Copilot: $XX.XX (YYY inc + ZZZ add)`

#### Formats Possibles

```
💳 Copilot: $12.50 (100 inc + 150 add)      ✓ Données disponibles
💳 Copilot: (données stale)                  ⏳ Données anciennes (> 1h)
💳 Copilot: (n/a - pas configuré)           ⚠️ Token non configuré
⚠️ Copilot: Error (Unauthorized)             ❌ Token invalide
```

#### Actualiser Manuellement

```
Ctrl+Shift+P
> Nexkit: Refresh AI Credit Usage
```

## 📋 Configuration Côté Serveur (Pour les Organisations)

### Contexte : Pourquoi Distribuer des Tokens ?

Les organisations peuvent vouloir fournir un token de facturation pré-configuré aux employés pour :

- ✅ **Simplifier le Setup** : Les utilisateurs n'ont pas besoin de créer leur propre token
- ✅ **Audit Centralisé** : Un seul token d'administration pour tracker la consommation
- ✅ **Sécurité** : Contrôler les permissions et la révocation centralement
- ✅ **Support** : Déboguer les problèmes de facturation plus facilement

### Architecture Recommandée

Pour distribuer sécurisement un token de facturation :

```
┌────────────────────────────────────────────────────────────┐
│ Server-Side Distribution                                   │
│ (Azure Function, Kubernetes Job, Lambda, etc.)             │
└────────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────────┐
│ Authentication Layer                                       │
│ - Vérifier l'identité de l'utilisateur (OIDC/AAD)          │
│ - Valider l'adhésion à l'organisation                      │
│ - Générer un JWT/Token temporaire                          │
└────────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────────┐
│ Credential Management                                      │
│ - Récupérer le GitHub PAT d'administration sécurisé        │
│ - Dériver un scope limité par utilisateur (optionnel)      │
│ - Retourner au client de façon chiffré (HTTPS + TLS)       │
└────────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────────┐
│ NexKit Client                                              │
│ - Reçoit le token via HTTPS (chiffré en transit)           │
│ - Stocke dans VS Code SecretStorage (chiffré au repos)     │
│ - Utilise pour les requêtes GitHub API                     │
└────────────────────────────────────────────────────────────┘
```

### Option 1 : Distribution via Azure Function (Recommandée)

#### Architecture

```yaml
GitHub Organization Admin
  ↓
  Creates Service Account Token (with billing scope)
  ↓
  Stored in Azure Key Vault
  ↓
  Azure Function (REST API)
    - Authenticate user (Azure AD / OIDC)
    - Validate org membership
    - Return token via HTTPS
  ↓
  NexKit Extension
    - Calls Azure Function endpoint
    - Stores token in VS Code SecretStorage
```

#### Implémentation de l'Azure Function

```typescript
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

const httpTrigger: AzureFunction = async (
  context: Context,
  req: HttpRequest
): Promise<void> => {
  try {
    // 1. Authenticate user
    const authHeader = req.headers["authorization"];
    const userId = await validateToken(authHeader); // Implement your auth
    
    if (!userId) {
      context.res = {
        status: 401,
        body: { error: "Unauthorized" }
      };
      return;
    }

    // 2. Validate org membership
    const isOrgMember = await checkOrgMembership(userId);
    if (!isOrgMember) {
      context.res = {
        status: 403,
        body: { error: "Not an organization member" }
      };
      return;
    }

    // 3. Retrieve GitHub PAT from Key Vault
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(
      process.env.KEY_VAULT_URI!,
      credential
    );
    
    const secret = await client.getSecret("github-billing-pat");
    const githubPat = secret.value;

    // 4. Return token to client (HTTPS ensures TLS encryption)
    context.res = {
      status: 200,
      body: {
        token: githubPat,
        expiresIn: 86400 // 24 hours
      },
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    };

  } catch (error) {
    context.res = {
      status: 500,
      body: { error: "Internal server error" }
    };
    context.log.error(error);
  }
};

export default httpTrigger;
```

#### Configuration NexKit (Client)

```typescript
// In NexKit extension
async function fetchOrganizationBillingToken(userId: string): Promise<string> {
  const functionUrl = "https://your-org.azurewebsites.net/api/github-billing-token";
  
  const response = await fetch(functionUrl, {
    method: "GET",
    headers: {
      "Authorization": `******
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch billing token: ${response.statusText}`);
  }

  const data = await response.json();
  return data.token; // Automatically stored in SecretStorage by NexKit
}
```

### Option 2 : Distribution via GitHub Organization Secret

#### Limitations

- ⚠️ Tous les membres voient le même token
- ⚠️ Pas d'attribution par utilisateur
- ⚠️ Révocation affecte tous les utilisateurs

#### Setup

1. **Créer un GitHub PAT**
   - Scope : `user:billing`
   - Type : Service account (optionnel)

2. **Stocker dans GitHub Organization Secrets**
   - `Settings → Secrets and variables → Actions`
   - Nom : `GITHUB_BILLING_PAT`

3. **Distribuer aux Utilisateurs**
   - Via Documentation Interne
   - Via Script PowerShell/Bash
   - Via Email sécurisé

### Option 3 : Distribution via Kubernetes Secret

#### Pour les Environnements Containers

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: github-billing-pat
  namespace: nexkit
type: Opaque
stringData:
  pat: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nexkit-agent
  namespace: nexkit
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: nexkit-secrets-reader
  namespace: nexkit
rules:
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["github-billing-pat"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: nexkit-read-secrets
  namespace: nexkit
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: nexkit-secrets-reader
subjects:
- kind: ServiceAccount
  name: nexkit-agent
  namespace: nexkit
```

## 🔐 Bonnes Pratiques de Sécurité

### Pour les Utilisateurs

- ✅ **Utilisez des Tokens avec Scope Limité** : Seulement `user:billing`, jamais `repo` ou `admin`
- ✅ **Pas d'Expiration VS. Expiration Courte** : Choisissez selon votre profil de sécurité
- ✅ **Changez de Token Régulièrement** : Tous les 3-6 mois
- ✅ **Ne Partagez JAMAIS le Token** : C'est une clé secrète personnelle
- ✅ **Révoquez si Compromis** : Allez dans GitHub Settings et supprimez immédiatement
- ✅ **Utilisez GitHub SSO** : Si possible, préférez SSO à des tokens personnels

### Pour les Organisations

- ✅ **Utilisez un Service Account** : Créez un compte robot GitHub pour les tokens d'administration
- ✅ **Stockez dans un Secret Manager** : Azure Key Vault, AWS Secrets Manager, HashiCorp Vault
- ✅ **Rotation de Secrets** : Régénérez les tokens tous les 90 jours
- ✅ **Audit et Logging** : Loggez qui accède aux credentials
- ✅ **Chiffrement en Transit** : Toujours utiliser HTTPS/TLS
- ✅ **Chiffrement au Repos** : Utiliser le Secret Manager de votre plateforme cloud
- ✅ **Minimisation des Permissions** : Service account n'a accès qu'aux resources nécessaires
- ✅ **Monitoring** : Alertes si le token est utilisé de façon anormale

## ⚠️ Dépannage

### Problème : "Unauthorized" (401)

**Causes Possibles** :
- Token expiré
- Token mal copié
- Token révoqué

**Solutions** :
1. Allez dans GitHub Settings → Personal access tokens
2. Vérifiez que le token existe toujours
3. Régénérez un nouveau token si nécessaire
4. Mettez à jour NexKit : `Nexkit: Open AI Credit Settings` → `Add/Update Billing Token`

### Problème : "Forbidden" (403)

**Causes Possibles** :
- Token ne pas le scope `user:billing`
- Utilisateur ne pas d'accès GitHub Copilot

**Solutions** :
1. Vérifiez le scope du token : GitHub → Settings → Personal access tokens → Voir le token
2. Régénérez avec le scope correct : `user:billing`
3. Vérifiez que vous avez une license GitHub Copilot active

### Problème : "No billing data available"

**Causes Possibles** :
- Pas d'utilisation du mois en cours (affiche 0)
- Période de facturation pas encore disponible

**Solutions** :
- C'est normal si vous n'avez pas utilisé Copilot ce mois
- Attendez quelques minutes après utilisation pour le premier refresh
- Utilisez `Nexkit: Refresh AI Credit Usage` pour forcer un refresh

### Problème : Status bar affiche "(n/a - pas configuré)"

**Causes Possibles** :
- Token non stocké
- Token supprimé

**Solutions** :
1. Palette de commandes : `Nexkit: Open AI Credit Settings`
2. Sélectionnez : `Add/Update Billing Token`
3. Entrez votre GitHub PAT
4. Vérifiez le status bar

### Problème : Status bar affiche "(données stale)"

**Causes Possibles** :
- Données non actualisées depuis > 1 heure
- Erreur lors du dernier refresh

**Solutions** :
1. Palette de commandes : `Nexkit: Refresh AI Credit Usage`
2. Attendez la mise à jour (5-10 secondes)

### Problème : "GitHub API rate limit exceeded"

**Causes Possibles** :
- Trop de requêtes au-delà du rate limit (60/h non-auth, 5000/h auth)
- Refresh déclenché très souvent

**Solutions** :
1. NexKit ne fait qu'un refresh toutes les heures par défaut
2. Attendez l'heure suivante (limit reset)
3. Évitez de manuellement refresh plus d'une fois par minute
4. Si ce problema persiste, vérifiez que vous utilisez le bon token

## 📞 Support

### Resources Officielles

- **GitHub Docs**: https://docs.github.com/en/billing/managing-billing-for-github-copilot
- **VS Code SecretStorage**: https://code.visualstudio.com/api/references/vscode-api#SecretStorage
- **GitHub API**: https://docs.github.com/en/rest/billing

### Signaler un Problème

- **Issues GitHub** : https://github.com/NexusInnovation/nexus-nexkit-vscode/issues
- **Discussions** : https://github.com/NexusInnovation/nexus-nexkit-vscode/discussions

## 🔄 Mise à Jour et Révocation

### Mettre à Jour le Token

Si vous avez créé un nouveau token :

1. `Ctrl+Shift+P` → `Nexkit: Open AI Credit Settings`
2. Sélectionnez : `Add/Update Billing Token`
3. Entrez le nouveau token

L'ancien token est automatiquement remplacé.

### Supprimer le Token

Pour arrêter le suivi des crédits :

1. `Ctrl+Shift+P` → `Nexkit: Open AI Credit Settings`
2. Sélectionnez : `Remove Billing Token`
3. Confirmez la suppression

Le token est supprimé de VS Code. Vous pouvez toujours révoquer le token sur GitHub.com si needed.

## 📊 Limitations Connues

- ⚠️ **Attribut à Coté de Utilisateur** : Pas de tracking per-user si plusieurs comptes GitHub
- ⚠️ **Latence de Facturation** : GitHub met à jour la facturation avec un délai de quelques heures
- ⚠️ **Pas de Prévisions** : Affiche usage historical, pas de projections futures
- ⚠️ **Pas de Budget** : Pas de limite/alerte si dépassement de budget
- ⚠️ **Pas de Data Organisation** : Les données ne montrent que l'utilisateur connecté

## ✅ Checklist de Configuration

- [ ] GitHub Copilot license active
- [ ] PAT créé avec scope `user:billing`
- [ ] PAT token copié (sauvegardé de façon sécurisée)
- [ ] Entrée via `Nexkit: Open AI Credit Settings`
- [ ] Confirmation du message "Billing token stored"
- [ ] Vérification du status bar : `💳 Copilot: $X.XX ...`
- [ ] Test de refresh manuel : `Nexkit: Refresh AI Credit Usage`

---

**Dernière mise à jour** : juillet 2026  
**Applicable à** : NexKit v3.0+ avec support AI Credit Monitoring
