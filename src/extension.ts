import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('File Explorer Expand All extension is now active!');

    // コマンドを登録
    let disposable = vscode.commands.registerCommand('fileExplorer.expandAll', async () => {
        await expandAllFolders();
    });

    context.subscriptions.push(disposable);
}

/**
 * すべてのフォルダを再帰的に展開する関数
 */
async function expandAllFolders() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showInformationMessage('No workspace folder is open.');
        return;
    }

    try {
        // まずエクスプローラーにフォーカス
        await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer');
        await new Promise(resolve => setTimeout(resolve, 200));

        // ワークスペースルートを選択
        await vscode.commands.executeCommand('list.selectAll');
        await new Promise(resolve => setTimeout(resolve, 100));

        // キャンセル可能なプログレスバーを表示
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Expanding file explorer folders...",
            cancellable: true
        }, async (progress, token) => {

            // 手法1: キーボードショートカットをシミュレート
            try {
                await vscode.commands.executeCommand('workbench.files.action.collapseExplorerFolders');
                await new Promise(resolve => setTimeout(resolve, 100));

                // 各ワークスペースフォルダに対して展開を試行
                for (let i = 0; i < workspaceFolders.length; i++) {
                    if (token.isCancellationRequested) {
                        vscode.window.showInformationMessage('Expansion cancelled by user.');
                        return;
                    }

                    const folder = workspaceFolders[i];
                    progress.report({ message: `Expanding workspace: ${folder.name}` });

                    // フォルダにフォーカスしてから展開
                    await vscode.commands.executeCommand('revealInExplorer', folder.uri);
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // 右矢印キーを送信して展開を試行
                    await vscode.commands.executeCommand('list.expand');
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                // 手法2: 各フォルダを個別に処理
                for (const folder of workspaceFolders) {
                    if (token.isCancellationRequested) {
                        vscode.window.showInformationMessage('Expansion cancelled by user.');
                        return;
                    }

                    progress.report({ message: `Recursively expanding: ${folder.name}` });
                    await expandFolderRecursively(folder.uri, 0, token, progress);
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
