# File Explorer Expand Recursively

Recursively expand folder nodes in the file explorer tree view.

## Features

- **Recursive Expansion**: Recursively expands all subfolders within selected folders
- **Context Menu Integration**: Right-click on any folder in the explorer to expand it recursively
- **Multi-Selection Support**: Select multiple folders and expand them all at once
- **Command Palette Support**: Access the expansion feature via Command Palette
- **Cancellation Support**: Cancel the expansion process at any time
- **High Performance**: Optimized for fast expansion with minimal UI blocking

## Usage

### Expand Single Folder
1. Right-click on any folder in the VS Code file explorer
2. Select "Expand Recursively" from the context menu
3. All subfolders will be expanded automatically

### Expand Multiple Folders
1. Select multiple folders in the file explorer (Ctrl+click or Shift+click)
2. Right-click on one of the selected folders
3. Choose "Expand Recursively" to expand all selected folders

### Expand All Workspace Folders
1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Expand Recursively" and press Enter
3. All workspace folders will be expanded

![demo](./resources/demo.gif)

## Requirements

Visual Studio Code version 1.74.0 or higher

## License

Licensed under MIT