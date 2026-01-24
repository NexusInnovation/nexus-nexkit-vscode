# Local Template File Watching

## Overview

The Nexkit VS Code extension now automatically watches local template folders for file changes and updates the template list dynamically. This feature provides a seamless experience when working with local template repositories.

## How It Works

### Automatic Detection

When you configure a local folder repository, the extension automatically:

1. **Creates File System Watchers** - Monitors all `.md` files recursively in the template folder
2. **Detects Changes** - Responds to file create, modify, and delete events
3. **Updates Template List** - Refreshes the affected repository's templates automatically
4. **Updates UI** - The webview panel reflects changes immediately

### Debouncing

To prevent excessive refreshes from rapid file changes (e.g., during save operations), the system implements intelligent debouncing:

- **500ms delay** - Multiple changes within 500ms trigger only one refresh
- **Per-repository** - Each repository has independent debouncing
- **Efficient** - Only the affected repository is refreshed, not all repositories

## Configuration

### Local Repository Setup

Configure a local template repository in your VS Code settings:

```json
{
  "nexkit.repositories": [
    {
      "name": "my-local-templates",
      "url": "C:\\Users\\MyUser\\templates",
      "type": "local",
      "enabled": true,
      "paths": {
        "agents": "agents",
        "prompts": "prompts",
        "instructions": "instructions",
        "chatmodes": "chatmodes"
      }
    }
  ]
}
```

### Supported Path Formats

The `url` field supports multiple path formats:

- **Absolute paths**: `C:\templates`, `/home/user/templates`
- **Workspace-relative**: `./templates`, `../shared-templates`
- **Home directory**: `~/templates`

## Technical Implementation

### Architecture

The file watching feature is implemented in `AITemplateDataService` as the main coordinator:

```
LocalFolderTemplateProvider
    ↓ (provides base path)
AITemplateDataService
    ↓ (creates watcher)
vscode.FileSystemWatcher
    ↓ (monitors filesystem)
File Events (create/change/delete)
    ↓ (debounced)
refreshRepository(name)
    ↓
TemplateDataStore.updateCollection()
    ↓ (fires event)
Webview Panel Updates
```

### Key Components

1. **LocalFolderTemplateProvider.getResolvedBasePath()**
   - Returns the absolute path to watch
   - Handles path resolution (relative, absolute, home directory)

2. **AITemplateDataService.setupFileWatchers()**
   - Creates watchers for all local repositories
   - Called after initialization and on configuration changes
   - Skips GitHub repositories (they don't change on disk)

3. **AITemplateDataService.refreshRepository()**
   - Refreshes templates from a single repository
   - More efficient than refreshing all repositories
   - Updates the data store which triggers UI updates

4. **Debouncing System**
   - Uses `Map<string, NodeJS.Timeout>` to track pending refreshes
   - Clears existing timers when new changes detected
   - Ensures smooth performance during active editing

### Error Handling

The implementation handles various error scenarios gracefully:

- **Path resolution failures** - Logged as warnings, watcher skipped
- **Watcher creation failures** - Caught and logged, continues with other repositories
- **Refresh failures** - Logged and fires `onError` event
- **Configuration changes** - Old watchers disposed, new ones created

## Usage Examples

### Scenario 1: Adding a New Template

1. Create a new file: `C:\templates\agents\my-agent.md`
2. Extension detects the creation automatically
3. After 500ms debounce period, templates refresh
4. New template appears in the Nexkit panel

### Scenario 2: Editing Multiple Templates

1. Edit 5 template files in quick succession
2. File watcher detects all changes
3. Debouncing combines them into a single refresh
4. Templates update once after all changes settle

### Scenario 3: Deleting a Template

1. Delete `C:\templates\prompts\old-prompt.md`
2. Extension detects the deletion
3. Template list updates automatically
4. Deleted template disappears from the panel

## Benefits

- **Real-time Updates** - No manual refresh needed
- **Better Workflow** - Edit templates in your favorite editor
- **Performance** - Debouncing prevents excessive refreshes
- **Selective Updates** - Only affected repository refreshes
- **Transparent** - Works automatically in the background

## Limitations

- **Local Repositories Only** - GitHub repositories not watched (they don't exist on local disk)
- **Markdown Files Only** - Only `.md` files are monitored
- **Network Paths** - May have slower performance on network drives
- **Large Repositories** - Very large template folders may impact performance

## Troubleshooting

### Templates Not Updating

1. Check the repository type is set to `"type": "local"`
2. Verify the path exists and is accessible
3. Check VS Code's Output panel for errors
4. Try manually refreshing templates with the refresh command

### Performance Issues

1. Reduce the number of watched folders
2. Use specific paths rather than watching entire drives
3. Check for excessive file changes (e.g., build outputs in template folder)

## Future Enhancements

Potential improvements for future versions:

- Configurable debounce delay
- Selective file type watching (beyond `.md`)
- Performance metrics and monitoring
- Manual enable/disable per repository
- Notification options for template changes
