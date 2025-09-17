import * as vscode from 'vscode';

export class Formatter implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        let firstLine = document.lineAt(0);
        let tedit: vscode.TextEdit = vscode.TextEdit.delete(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, firstLine.range.end.character)));
        
        for (let i = 0; i < document.lineCount; i++) {
            let line: vscode.TextLine = document.lineAt(i);
            console.log(line.text);
        }
        let arr: vscode.TextEdit[] = [tedit];

        return arr;
    }

}