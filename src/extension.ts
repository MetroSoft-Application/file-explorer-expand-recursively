import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    console.log('File Explorer Expand All extension is now active!');

    // コマンドを登録（複数のURIを受け取れるように修正）
    let disposable = vscode.commands.registerCommand('fileExplorer.expandRecursively', async (uri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
        await expandAllFolders(uri, selectedUris);
    });

    context.subscriptions.push(disposable);
}

/**
 * 設定から除外パターンを取得
 */
function getExcludePatterns(): string[] {
    const config = vscode.workspace.getConfiguration('fileExplorer.expandRecursively');
    const patterns = config.get<string[]>('excludePatterns') || [];
    console.log('Exclude patterns from config:', patterns);
    return patterns;
}

/**
 * フォルダが除外パターンにマッチするかチェック
 */
function shouldExcludeFolder(folderName: string, excludePatterns: string[]): boolean {
    const shouldExclude = excludePatterns.some(pattern => {
        // 単純なグロブパターンのサポート
        if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
            return regex.test(folderName);
        }
        // 完全一致
        return folderName.toLowerCase() === pattern.toLowerCase();
    });

    if (shouldExclude) {
        console.log(`Excluding folder: ${folderName} (matches pattern)`);
    }

    return shouldExclude;
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
        await new Promise(resolve => setTimeout(resolve, 100));

        // 対象フォルダを決定
        let foldersToExpand: vscode.Uri[] = [];

        // 複数選択がある場合は優先的に使用
        if (selectedUris && selectedUris.length > 0) {
            // 複数選択されたフォルダを処理
            foldersToExpand = selectedUris;
            vscode.window.showInformationMessage(`Recursively expanding ${foldersToExpand.length} selected folders...`);
        } else if (targetUri) {
            // 単一フォルダが指定された場合
            foldersToExpand = [targetUri];
            vscode.window.showInformationMessage(`Recursively expanding folder: ${vscode.workspace.asRelativePath(targetUri)}`);
        } else {
            // コマンドパレットから実行された場合はワークスペース全体
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showInformationMessage('No workspace folder is open.');
                return;
            }
            foldersToExpand = workspaceFolders.map(folder => folder.uri);
            vscode.window.showInformationMessage('Recursively expanding all workspace folders...');
        }

        // 再帰展開処理
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Recursively expanding folders...",
            cancellable: true
        }, async (progress, token) => {
            try {
                // 全体をコラップスしてから始める（ワークスペース全体の場合のみ）
                if (!targetUri && (!selectedUris || selectedUris.length === 0)) {
                    await vscode.commands.executeCommand('workbench.files.action.collapseExplorerFolders');
                    await new Promise(resolve => setTimeout(resolve, 50));
                }

                // バッチ処理
                let processed = 0;
                for (const folder of foldersToExpand) {
                    if (token.isCancellationRequested) {
                        vscode.window.showInformationMessage('Expansion cancelled by user.');
                        return;
                    }

                    processed++;
                    progress.report({
                        message: `Processing ${processed}/${foldersToExpand.length}: ${vscode.workspace.asRelativePath(folder)}`,
                        increment: (processed / foldersToExpand.length) * 100
                    });

                    // フォルダを再帰的に展開
                    await fastExpandFolder(folder, token);
                }

                if (!token.isCancellationRequested) {
                    vscode.window.showInformationMessage(`Recursive expansion completed! All folders fully expanded.`);
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
 * フォルダを再帰的に展開する
 */
async function fastExpandFolder(folderUri: vscode.Uri, token: vscode.CancellationToken): Promise<void> {
    if (token.isCancellationRequested) {
        return;
    }

    try {
        // まずファイルかフォルダかを確認
        const stat = await vscode.workspace.fs.stat(folderUri);
        if (stat.type !== vscode.FileType.Directory) {
            console.log(`Skipping ${folderUri.path}: not a directory`);
            return;
        }

        // 除外パターンをチェック（フォルダ名のみ）
        const folderName = path.basename(folderUri.path);
        const excludePatterns = getExcludePatterns();
        if (shouldExcludeFolder(folderName, excludePatterns)) {
            console.log(`Skipping excluded folder: ${folderName}`);
            return;
        }

        // フォルダを選択
        await vscode.commands.executeCommand('revealInExplorer', folderUri);
        await new Promise(resolve => setTimeout(resolve, 30));

        // 再帰展開を実行
        await recursiveExpand(folderUri, token);

    } catch (error) {
        console.log(`Expand failed for ${folderUri.path}: ${error}`);
    }
}

/**
 * 再帰展開処理
 */
async function recursiveExpand(folderUri: vscode.Uri, token: vscode.CancellationToken): Promise<void> {
    if (token.isCancellationRequested) {
        return;
    }

    try {
        // フォルダかどうかを再度確認
        const stat = await vscode.workspace.fs.stat(folderUri);
        if (stat.type !== vscode.FileType.Directory) {
            console.log(`Skipping ${folderUri.path}: not a directory`);
            return;
        }

        // サブフォルダを取得
        const entries = await vscode.workspace.fs.readDirectory(folderUri);
        const excludePatterns = getExcludePatterns();

        const subFolders = entries
            .filter(([name, type]) => {
                if (type !== vscode.FileType.Directory) {
                    return false;
                }

                // 除外パターンをチェック
                if (shouldExcludeFolder(name, excludePatterns)) {
                    return false;
                }

                return true;
            })
            .map(([name]) => vscode.Uri.joinPath(folderUri, name));

        // 現在のフォルダを展開
        await vscode.commands.executeCommand('revealInExplorer', folderUri);
        await new Promise(resolve => setTimeout(resolve, 15));
        await vscode.commands.executeCommand('list.expand');
        await new Promise(resolve => setTimeout(resolve, 15));

        // サブフォルダを再帰的に展開
        for (const subFolder of subFolders) {
            if (token.isCancellationRequested) {
                return;
            }
            await recursiveExpand(subFolder, token);
        }

    } catch (error) {
        // より詳細なエラーログ
        if (error instanceof vscode.FileSystemError) {
            console.log(`FileSystem error for ${folderUri.path}: ${error.name} - ${error.message}`);
        } else {
            console.log(`Recursive expand failed for ${folderUri.path}: ${error}`);
        }
    }
}

/**
 * 拡張機能が非アクティブになる時の処理
 */
export function deactivate() {
    console.log('File Explorer Expand All extension is now deactivated.');
}
