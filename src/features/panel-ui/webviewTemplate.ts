// todo: review this file

/**
 * Generates HTML for the Nexkit webview panel
 */
export class WebviewTemplate {
  static generateHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nexkit Panel</title>
    ${WebviewTemplate.getStyles()}
</head>
<body>
    <div class="container">
        ${WebviewTemplate.getInfoSection()}
        ${WebviewTemplate.getActionsSection()}
        ${WebviewTemplate.getLibrarySection()}
    </div>
    ${WebviewTemplate.getScript()}
</body>
</html>
`;
  }

  private static getStyles(): string {
    return `
<style>
    body { font-family: sans-serif; margin: 0; padding: 0; }
    .container { padding: 16px; }
    
    /* Info Section */
    .static-info { background: #fffdfd23; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
    
    /* Actions Section */
    .actions { display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px; }
    button { padding: 8px 16px; font-size: 1em; border-radius: 4px; border: none; background: #007acc; color: white; cursor: pointer; }
    button:hover:not(:disabled) { background: #005fa3; }
    button:disabled { background: #555; color: #999; cursor: not-allowed; opacity: 0.6; }
    .button-description { font-size: 0.85em; color: #888; margin-top: 4px; margin-bottom: 8px; line-height: 1.3; }
    .button-description.disabled { opacity: 0.6; color: #666; }
    
    /* Library Section */
    .library-section { background: #fffdfd23; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
    .library-header { position: sticky; top: 0; z-index: 100; background: var(--vscode-editor-background, #1e1e1e); display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; padding: 4px; border-radius: 4px; transition: background 0.2s; }
    .library-header:hover { background: #ffffff08; }
    .library-header h2 { margin: 0; font-size: 1.2em; }
    .library-header .toggle { font-size: 1.2em; transition: transform 0.2s; }
    
    /* Search */
    .search-container { margin: 12px 0; padding: 8px; background: #ffffff08; border-radius: 4px; }
    .search-bar { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
    .search-input { flex: 1; padding: 8px 12px; border: 1px solid #555; border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 0.95em; }
    .search-input:focus { outline: none; border-color: #007acc; }
    .search-button { padding: 8px 16px; border: none; border-radius: 4px; background: #007acc; color: white; cursor: pointer; font-size: 0.95em; white-space: nowrap; }
    .search-button:hover { background: #005fa3; }
    .search-button.clear { background: #555; }
    .search-button.clear:hover { background: #666; }
    .search-button.refresh { background: #0e7a0d; }
    .search-button.refresh:hover { background: #0c5f0b; }
    .search-info { font-size: 0.85em; color: #888; margin-top: 4px; }
    
    /* Repository Sections */
    .repository { margin-top: 16px; border-left: 3px solid #007acc; padding-left: 12px; }
    .repository-header { display: flex; justify-content: space-between; align-items: center; padding: 8px; border-radius: 4px; cursor: pointer; user-select: none; margin-bottom: 8px; background: #ffffff05; }
    .repository-header:hover { background: #ffffff08; }
    .repository-header h3 { margin: 0; font-size: 1em; }
    .repository-info { display: flex; align-items: center; gap: 8px; }
    .repository-badge { background: #007acc; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.85em; }
    .repository-toggle { font-size: 1em; }
    .repository-content { display: none; padding-left: 8px; }
    .repository-content.expanded { display: block; }
    
    /* Category Groups */
    .category-group { margin-top: 12px; }
    .category-group-header { font-weight: 500; color: #888; font-size: 0.9em; margin-bottom: 8px; padding: 4px 8px; background: #ffffff05; border-radius: 4px; }
    
    /* Items */
    .item { display: flex; align-items: flex-start; padding: 8px; margin-bottom: 4px; border-radius: 4px; }
    .item:hover { background: #ffffff08; }
    .item input[type="checkbox"] { margin-right: 8px; margin-top: 2px; cursor: pointer; }
    .item-info { flex: 1; }
    .item-name { font-weight: 500; margin-bottom: 2px; }
    .item-description { font-size: 0.85em; color: #888; }
    
    /* States */
    .loading { text-align: center; padding: 20px; color: #888; }
    .error { color: #f48771; padding: 8px; }
    .empty { text-align: center; padding: 20px; color: #888; font-style: italic; }
    .search-highlight { background: #007acc33; padding: 2px 4px; border-radius: 2px; }
</style>
`;
  }

  private static getInfoSection(): string {
    return `
<div class="static-info">
    <h2>Nexkit Extension</h2>
    <p>Version: <span id="version">Loading...</span></p>
    <p>Status: <span id="status">Loading...</span></p>
</div>
`;
  }

  private static getActionsSection(): string {
    return `
<div class="actions">
    <button id="initializeProjectBtn" onclick="sendCommand('initProject')" disabled>Initialize Project</button>
    <p class="button-description disabled" id="initializeProjectBtnDesc">Set up Nexkit templates and configuration for your workspace</p>
    
    <button id="installUserMCPsBtn" onclick="sendCommand('installUserMCPs')">Install User MCP Servers</button>
    <p class="button-description" id="installUserMCPsBtnDesc">Install required MCP servers for enhanced AI capabilities</p>
    
    <button id="openSettingsBtn" onclick="sendCommand('openSettings')">Open Settings</button>
    <p class="button-description" id="openSettingsBtnDesc">Configure Nexkit extension preferences and project settings</p>
</div>
`;
  }

  private static getLibrarySection(): string {
    return `
<div class="library-section">
    <div class="library-header" onclick="toggleLibrary()">
        <h2>Content Library</h2>
        <span class="toggle" id="libraryToggle">▶</span>
    </div>
    <div id="libraryContent" class="repository-content">
        <p class="button-description">Browse and install agents, prompts, instructions, and chatmodes from configured repositories</p>
        
        <!-- Search Bar -->
        <div class="search-container" id="searchContainer" style="display: none;">
            <div class="search-bar">
                <input 
                    type="text" 
                    id="searchInput" 
                    class="search-input" 
                    placeholder="Search by name or description..." 
                    oninput="performSearch()"
                />
                <button class="search-button refresh" onclick="refreshRepositories()">🔄 Refresh</button>
                <button class="search-button clear" id="clearSearchBtn" onclick="clearSearch()" style="display: none;">Clear</button>
            </div>
            <div class="search-info" id="searchInfo"></div>
        </div>
        
        <!-- Repositories will be dynamically loaded here -->
        <div id="repositoriesContainer">
            <div class="loading">Loading repositories...</div>
        </div>
    </div>
</div>
`;
  }

  private static getScript(): string {
    return `
<script>
    const vscode = acquireVsCodeApi();
    
    // State management
    let libraryExpanded = false;
    let expandedRepositories = new Set();
    let repositories = {};
    let installedItems = { agents: new Set(), prompts: new Set(), instructions: new Set(), chatmodes: new Set() };
    let allItemsLoaded = false;
    let searchActive = false;
    let searchResults = {};
    
    // Helper functions
    function sendCommand(command, data = {}) {
        vscode.postMessage({ command, ...data });
    }
    
    function toggleLibrary() {
        libraryExpanded = !libraryExpanded;
        const content = document.getElementById('libraryContent');
        const toggle = document.getElementById('libraryToggle');
        const searchContainer = document.getElementById('searchContainer');
        
        if (libraryExpanded) {
            content.classList.add('expanded');
            toggle.textContent = '▼';
            searchContainer.style.display = 'block';
            if (!allItemsLoaded) {
                sendCommand('loadRepositories');
            }
        } else {
            content.classList.remove('expanded');
            toggle.textContent = '▶';
            searchContainer.style.display = 'none';
        }
    }
    
    function toggleRepository(repoName) {
        const content = document.getElementById('repo-' + sanitizeId(repoName) + '-content');
        const toggle = document.getElementById('repo-' + sanitizeId(repoName) + '-toggle');
        
        if (expandedRepositories.has(repoName)) {
            expandedRepositories.delete(repoName);
            content.classList.remove('expanded');
            toggle.textContent = '▶';
        } else {
            expandedRepositories.add(repoName);
            content.classList.add('expanded');
            toggle.textContent = '▼';
        }
    }
    
    function sanitizeId(str) {
        return str.replace(/[^a-zA-Z0-9]/g, '-');
    }
    
    function refreshRepositories() {
        allItemsLoaded = false;
        sendCommand('refreshRepositories');
    }
    
    function performSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchInfo = document.getElementById('searchInfo');
        const clearBtn = document.getElementById('clearSearchBtn');
        const query = searchInput.value.trim().toLowerCase();
        
        if (!query) {
            if (searchActive) {
                clearSearch();
            }
            return;
        }
        
        searchActive = true;
        clearBtn.style.display = 'block';
        
        // Normalize query for accent-insensitive search
        const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Search across all repositories and categories
        let totalResults = 0;
        searchResults = {};
        
        for (const [repoName, repoData] of Object.entries(repositories)) {
            searchResults[repoName] = {
                agents: [],
                prompts: [],
                instructions: [],
                chatmodes: []
            };
            
            for (const [category, items] of Object.entries(repoData)) {
                searchResults[repoName][category] = items.filter(item => {
                    const normalizedName = item.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    return normalizedName.includes(normalizedQuery);
                });
                totalResults += searchResults[repoName][category].length;
            }
        }
        
        searchInfo.textContent = \`Found \${totalResults} result\${totalResults !== 1 ? 's' : ''} for "\${query}"\`;
        
        // Auto-expand repositories with results
        for (const repoName of Object.keys(searchResults)) {
            const hasResults = Object.values(searchResults[repoName]).some(items => items.length > 0);
            if (hasResults) {
                expandedRepositories.add(repoName);
            }
        }
        
        renderRepositories();
    }
    
    function clearSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchInfo = document.getElementById('searchInfo');
        const clearBtn = document.getElementById('clearSearchBtn');
        
        searchInput.value = '';
        searchInfo.textContent = '';
        clearBtn.style.display = 'none';
        searchActive = false;
        searchResults = {};
        
        renderRepositories();
    }
    
    function handleCheckboxChange(repoName, category, itemName, isChecked) {
        const item = repositories[repoName][category].find(i => i.name === itemName);
        if (!item) return;
        
        if (isChecked) {
            installedItems[category].add(itemName);
            sendCommand('installItem', { item });
        } else {
            installedItems[category].delete(itemName);
            sendCommand('uninstallItem', { item });
        }
        
        updateBadges();
    }
    
    function renderRepositories() {
        const container = document.getElementById('repositoriesContainer');
        const dataToRender = searchActive ? searchResults : repositories;
        
        if (Object.keys(dataToRender).length === 0) {
            container.innerHTML = '<div class="empty">No repositories configured</div>';
            return;
        }
        
        const searchQuery = searchActive ? document.getElementById('searchInput').value.trim().toLowerCase() : '';
        
        container.innerHTML = Object.entries(dataToRender).map(([repoName, repoData]) => {
            const totalItems = Object.values(repoData).reduce((sum, items) => sum + items.length, 0);
            const installedCount = Object.entries(repoData).reduce((sum, [category, items]) => {
                return sum + items.filter(item => installedItems[category].has(item.name)).length;
            }, 0);
            
            const repoId = sanitizeId(repoName);
            const isExpanded = expandedRepositories.has(repoName);
            
            return \`
                <div class="repository">
                    <div class="repository-header" onclick="toggleRepository('\${repoName}')">
                        <h3>\${repoName}</h3>
                        <div class="repository-info">
                            <span class="repository-badge">\${installedCount}/\${totalItems}</span>
                            <span class="repository-toggle" id="repo-\${repoId}-toggle">\${isExpanded ? '▼' : '▶'}</span>
                        </div>
                    </div>
                    <div id="repo-\${repoId}-content" class="repository-content \${isExpanded ? 'expanded' : ''}">
                        \${renderCategories(repoName, repoData, searchQuery)}
                    </div>
                </div>
            \`;
        }).join('');
    }
    
    function renderCategories(repoName, repoData, searchQuery) {
        const categoryOrder = ['agents', 'prompts', 'instructions', 'chatmodes'];
        const categoryIcons = { agents: '🤖', prompts: '🎯', instructions: '📋', chatmodes: '💬' };
        const categoryLabels = { agents: 'Agents', prompts: 'Prompts', instructions: 'Instructions', chatmodes: 'Chat Modes' };
        
        return categoryOrder
            .filter(category => repoData[category] && repoData[category].length > 0)
            .map(category => {
                const items = repoData[category];
                return \`
                    <div class="category-group">
                        <div class="category-group-header">\${categoryIcons[category]} \${categoryLabels[category]}</div>
                        \${items.map(item => renderItem(repoName, category, item, searchQuery)).join('')}
                    </div>
                \`;
            }).join('') || '<div class="empty">No items available</div>';
    }
    
    function renderItem(repoName, category, item, searchQuery) {
        const isInstalled = installedItems[category].has(item.name);
        const itemId = sanitizeId(repoName + '-' + category + '-' + item.name);
        
        let displayName = item.name;
        
        if (searchQuery) {
            const normalizedQuery = searchQuery.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const highlightText = (text) => {
                const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const regex = new RegExp(\`(\${normalizedQuery})\`, 'gi');
                return text.replace(regex, '<span class="search-highlight">$1</span>');
            };
            displayName = highlightText(displayName);
        }
        
        return \`
            <div class="item">
                <input 
                    type="checkbox" 
                    id="\${itemId}" 
                    \${isInstalled ? 'checked' : ''}
                    onchange="handleCheckboxChange('\${repoName}', '\${category}', '\${item.name}', this.checked)"
                />
                <label class="item-info" for="\${itemId}">
                    <div class="item-name">\${displayName}</div>
                </label>
            </div>
        \`;
    }
    
    function updateBadges() {
        renderRepositories();
    }
    
    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        if (typeof message.version !== 'undefined') {
            document.getElementById('version').textContent = message.version;
        }
        if (typeof message.status !== 'undefined') {
            document.getElementById('status').textContent = message.status;
        }
        
        if (message.command === 'repositoriesLoaded') {
            // Transform flat repository items array to grouped by category
            repositories = {};
            for (const [repoName, items] of Object.entries(message.repositories)) {
                repositories[repoName] = {
                    agents: [],
                    prompts: [],
                    instructions: [],
                    chatmodes: []
                };
                
                for (const item of items) {
                    repositories[repoName][item.category].push(item);
                }
            }
            
            installedItems = {
                agents: new Set(message.installed.agents || []),
                prompts: new Set(message.installed.prompts || []),
                instructions: new Set(message.installed.instructions || []),
                chatmodes: new Set(message.installed.chatmodes || [])
            };
            allItemsLoaded = true;
            
            renderRepositories();
        }
        
        if (message.command === 'itemInstalled') {
            installedItems[message.item.category].add(message.item.name);
            updateBadges();
        }
        
        if (message.command === 'itemUninstalled') {
            installedItems[message.item.category].delete(message.item.name);
            updateBadges();
        }
        
        if (message.command === 'repositoriesError') {
            document.getElementById('repositoriesContainer').innerHTML = 
                \`<div class="error">Error loading repositories: \${message.error}</div>\`;
        }
        
        // Handle button states
        const updateTemplatesBtn = document.getElementById('updateTemplatesBtn');
        const initializeProjectBtn = document.getElementById('initializeProjectBtn');
        const reinitializeProjectBtn = document.getElementById('reinitializeProjectBtn');
        const updateTemplatesBtnDesc = document.getElementById('updateTemplatesBtnDesc');
        const initializeProjectBtnDesc = document.getElementById('initializeProjectBtnDesc');
        const reinitializeProjectBtnDesc = document.getElementById('reinitializeProjectBtnDesc');
        
        if (typeof message.isInitialized !== 'undefined') {
            if (message.isInitialized) {
                initializeProjectBtn.style.display = 'none';
                initializeProjectBtnDesc.style.display = 'none';
                reinitializeProjectBtn.style.display = 'block';
                reinitializeProjectBtnDesc.style.display = 'block';
            } else {
                initializeProjectBtn.style.display = 'block';
                initializeProjectBtnDesc.style.display = 'block';
                reinitializeProjectBtn.style.display = 'none';
                reinitializeProjectBtnDesc.style.display = 'none';
            }
        }
        
        if (typeof message.hasWorkspace !== 'undefined') {
            if (updateTemplatesBtn) updateTemplatesBtn.disabled = !message.hasWorkspace;
            if (initializeProjectBtn) initializeProjectBtn.disabled = !message.hasWorkspace;
            if (reinitializeProjectBtn) reinitializeProjectBtn.disabled = !message.hasWorkspace;
            
            [updateTemplatesBtnDesc, initializeProjectBtnDesc, reinitializeProjectBtnDesc].forEach(desc => {
                if (desc) {
                    if (message.hasWorkspace) {
                        desc.classList.remove('disabled');
                    } else {
                        desc.classList.add('disabled');
                    }
                }
            });
        }
    });
    
    // Signal ready to extension
    sendCommand('ready');
</script>
`;
  }
}
