import * as vscode from 'vscode';

export class Formatter implements vscode.DocumentFormattingEditProvider {
    /**
     * helper func to debug, delete in prod
     * @param charr character number on line 0 to get
     * @returns a string for the return of getText(), undefined returns ""
     */
    getChar(line: number, charr: number): string {
        let charia = vscode.window.activeTextEditor?.document.getText(new vscode.Range(new vscode.Position(line, charr), new vscode.Position(line, charr+1))) ?? "";
        return charia;
    } 

    provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        // Entire part is to expose stuff to the debug REPL. Delete in prod
        let getChar = this.getChar;
        (globalThis as any).vscode = vscode;
        (globalThis as any).Range = vscode.Range;
        (globalThis as any).Position = vscode.Position;
        (globalThis as any).document = document;

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