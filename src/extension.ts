import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('File Explorer Expand All extension is now active!');

    // コマンドを登録（複数のURIを受け取れるように修正）
    let disposable = vscode.commands.registerCommand('fileExplorer.expandAll', async (uri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
        await expandAllFolders(uri, selectedUris);
    });

    context.subscriptions.push(disposable);
}

/**
 * すべてのフォルダを再帰的に展開する関数
 * @param targetUri 右クリックされたフォルダのURI（指定されない場合はワークスペース全体）
 * @param selectedUris 複数選択されたフォルダのURI配列
 */
async function expandAllFolders(targetUri?: vscode.Uri, selectedUris?: vscode.Uri[]) {
    try {
        // まずエクスプローラーにフォーカス
        await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
        await new Promise(resolve => setTimeout(resolve, 200));

        // 対象フォルダを決定
        let foldersToExpand: vscode.Uri[] = [];

        // 複数選択がある場合は優先的に使用
        if (selectedUris && selectedUris.length > 0) {
            // 複数選択されたフォルダを処理
            for (const uri of selectedUris) {
                try {
                    const stat = await vscode.workspace.fs.stat(uri);
                    if (stat.type === vscode.FileType.Directory) {
                        foldersToExpand.push(uri);
                    }
                } catch (error) {
                    console.log(`Could not access ${uri.path}: ${error}`);
                }
            }

            if (foldersToExpand.length > 0) {
                const folderNames = foldersToExpand.map(uri => vscode.workspace.asRelativePath(uri)).join(', ');
                vscode.window.showInformationMessage(`Expanding ${foldersToExpand.length} selected folders: ${folderNames}`);
            } else {
                vscode.window.showErrorMessage('No valid folders found in selection.');
                return;
            }
        } else if (targetUri) {
            // 単一フォルダが指定された場合
            const stat = await vscode.workspace.fs.stat(targetUri);
            if (stat.type === vscode.FileType.Directory) {
                foldersToExpand = [targetUri];
                vscode.window.showInformationMessage(`Expanding folder: ${vscode.workspace.asRelativePath(targetUri)}`);
            } else {
                vscode.window.showErrorMessage('Selected item is not a folder.');
                return;
            }
        } else {
            // コマンドパレットから実行された場合はワークスペース全体
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showInformationMessage('No workspace folder is open.');
                return;
            }
            foldersToExpand = workspaceFolders.map(folder => folder.uri);
            vscode.window.showInformationMessage('Expanding all workspace folders...');
        }

        // ワークスペースルートを選択（ワークスペース全体の場合のみ）
        if (!targetUri && (!selectedUris || selectedUris.length === 0)) {
            await vscode.commands.executeCommand('list.selectAll');
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // キャンセル可能なプログレスバーを表示
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: (selectedUris && selectedUris.length > 0) ?
                `Expanding ${selectedUris.length} selected folders...` :
                targetUri ? "Expanding selected folder..." : "Expanding file explorer folders...",
            cancellable: true
        }, async (progress, token) => {

            try {
                // 全体をコラップスしてから始める（ワークスペース全体の場合のみ）
                if (!targetUri && (!selectedUris || selectedUris.length === 0)) {
                    await vscode.commands.executeCommand('workbench.files.action.collapseExplorerFolders');
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // 各フォルダを個別に処理
                for (const folder of foldersToExpand) {
                    if (token.isCancellationRequested) {
                        vscode.window.showInformationMessage('Expansion cancelled by user.');
                        return;
                    }

                    const folderName = (targetUri || (selectedUris && selectedUris.length > 0)) ?
                        vscode.workspace.asRelativePath(folder) :
                        vscode.workspace.getWorkspaceFolder(folder)?.name || folder.path;

                    progress.report({ message: `Recursively expanding: ${folderName}` });
                    await expandFolderRecursively(folder, 0, token, progress);
                }

                if (!token.isCancellationRequested) {
                    vscode.window.showInformationMessage('Folder expansion completed!');
                }

            } catch (error) {
                vscode.window.showErrorMessage(`Error during expansion: ${error}`);
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
    }
}

/**
 * フォルダを再帰的に展開
 */
async function expandFolderRecursively(
    folderUri: vscode.Uri,
    depth: number,
    token?: vscode.CancellationToken,
    progress?: vscode.Progress<{ message?: string; increment?: number; }>
): Promise<void> {
    if ((token?.isCancellationRequested) || depth > 5) {
        return;
    }

    try {
        const stat = await vscode.workspace.fs.stat(folderUri);
        if (stat.type !== vscode.FileType.Directory) {
            return;
        }

        // フォルダをエクスプローラーで表示
        await vscode.commands.executeCommand('revealInExplorer', folderUri);
        await new Promise(resolve => setTimeout(resolve, 100));

        // 展開を試行
        await vscode.commands.executeCommand('list.expand');
        await new Promise(resolve => setTimeout(resolve, 50));

        // サブフォルダを取得
        const entries = await vscode.workspace.fs.readDirectory(folderUri);
        const subFolders = entries.filter(([name, type]) =>
            type === vscode.FileType.Directory &&
            !name.startsWith('.') &&
            name !== 'node_modules'
        );

        // 各サブフォルダを再帰的に展開
        for (const [name, type] of subFolders) {
            if (token?.isCancellationRequested) {
                return;
            }

            const subFolderUri = vscode.Uri.joinPath(folderUri, name);
            const relativePath = vscode.workspace.asRelativePath(subFolderUri);

            if (progress) {
                progress.report({ message: `Expanding: ${relativePath}` });
            }

            await expandFolderRecursively(subFolderUri, depth + 1, token, progress);
        }

    } catch (error) {
        console.log(`Error expanding ${folderUri.path}: ${error}`);
    }
}

/**
 * 拡張機能が非アクティブになる時の処理
 */
export function deactivate() {
    console.log('File Explorer Expand All extension is now deactivated.');
}
