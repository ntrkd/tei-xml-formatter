import * as vscode from 'vscode';
import { Lexer } from './parser/lexer';
import { Token } from './parser/token';
import { json } from 'stream/consumers';

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

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("No active editor found.");
            return; // or throw an error
        }

        return;
    }

    /**
     * Helper function to insert the correct nubmer of indents
     * @param numTabs Number of tabs to retun
     * @returns a string with numTab number of \t
     */
    tabLines(numTabs: number): string {
        let str = "";
        for (let i = 0; i < numTabs; i++) {
            str += "\t";
        }

        return str;
    }
}