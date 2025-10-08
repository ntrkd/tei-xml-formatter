import * as vscode from 'vscode';
import { Lexer } from './parser/lexer';
import { Token } from './parser/token';
import { SaxesParser } from 'saxes';
import { format } from 'path';
import { partialDeepStrictEqual } from 'assert';

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

        let formatted: string[] = [];
        let indent: number = 0;

        const parser = new SaxesParser();
        const he = require("he");

        parser.on("error", function (e) {
            console.error(e);
            vscode.window.showErrorMessage("Error: " + e.message);
            return;
        });
        
        parser.on("xmldecl", dec => { // Always the first line in the XML document
            formatted.push(`<?xml version="${dec.version}"${dec.encoding !== undefined ? ` encoding="${dec.encoding}"` : ``}${dec.standalone !== undefined ? ` standalone="${dec.standalone}"` : ``}?>`);
        });
        
        parser.on("doctype", doc => {
            formatted.push(`<!DOCTYPE${doc}>`);
        });
        
        parser.on("processinginstruction", pi => {
            formatted.push(`${this.tabLines(indent)}<?${pi.target}${pi.body !== "" ? ` ${pi.body}` : ``}?>`);
        });
        
        parser.on("cdata", cdata => {
            formatted.push(`${this.tabLines(indent)}<![CDATA[${cdata}]]>`);
        });
        
        parser.on("opentag", tag => {
            let formattedTag = `<${tag.name}`; 

            const size = Object.keys(tag.attributes).length;

            if (size === 0) { // Is a regular closing tag
                if (tag.isSelfClosing) { formattedTag += `/`; }
                formattedTag += `>`;
                formatted.push(`${this.tabLines(indent)}${formattedTag}`);

                if (!tag.isSelfClosing) { indent++; }
                return;
            }
            for (const key in tag.attributes) {
                formattedTag += ` ${key}="${tag.attributes[`${key}`]}"`;
            }

            if (tag.isSelfClosing) { formattedTag += `/`; }
            formattedTag += `>`;
            formatted.push(`${this.tabLines(indent)}${formattedTag}`);

            indent++;
        });
        
        parser.on("closetag", tag => {
            if (tag.isSelfClosing) { return; } // This is already taken care of within the opentag handler
            indent--;
            
            formatted.push(`${this.tabLines(indent)}</${tag.name}>`);
        });
        
        parser.on("comment", comment => {
            formatted.push(`${this.tabLines(indent)}<!--${comment}-->`);
        });
        
        parser.on("text", text => {
            let parsedText = text.replace(/[\n\t]/g, "");
            parsedText = he.encode(parsedText);
            if (parsedText === "") { return; }
            
            formatted.push(`${this.tabLines(indent)}${parsedText}`);
        });

        parser.write(document.getText(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).range.end.character)))).close();

        let formatText = formatted.join("\n");

        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            vscode.window.showErrorMessage("No workspace open");
            return;
        }
        const fileUri = vscode.Uri.joinPath(folder.uri, "formatted.xml");
        vscode.workspace.fs.writeFile(fileUri, Buffer.from(formatText, "utf8"));

        return;
    }

    /**
     * Helper function to insert the correct nubmer of indents
     * @param numTabs Number of tabs to retun
     * @returns a string with numTab number of \t
     */
    tabLines(numTabs: number): string {
        if (numTabs <= 0) { return ""; }
        let str = "";
        for (let i = 0; i < numTabs; i++) {
            str += "\t";
        }

        return str;
    }
}