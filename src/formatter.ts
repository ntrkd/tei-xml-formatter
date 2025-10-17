import * as vscode from 'vscode';
import { SaxesParser } from 'saxes';

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

        let formatArr: string[] = [];
        let formatted: string = "";
        let indent: number = 0;
        let noIndent = false;

        const parser = new SaxesParser();
        const he = require("he");

        parser.on("error", function (e) {
            console.error(e);
            vscode.window.showErrorMessage("Error: " + e.message);
            return;
        });
        
        parser.on("xmldecl", dec => { // Always the first line in the XML document
            formatted += `<?xml version="${dec.version}"${dec.encoding !== undefined ? ` encoding="${dec.encoding}"` : ``}${dec.standalone !== undefined ? ` standalone="${dec.standalone}"` : ``}?>`;
        });
        
        parser.on("doctype", doc => {
            formatted += `<!DOCTYPE${doc}>`;
        });
        
        parser.on("processinginstruction", pi => {
            formatted += `${this.tabLines(indent, noIndent)}<?${pi.target}${pi.body !== "" ? ` ${pi.body}` : ``}?>`;
        });
        
        parser.on("cdata", cdata => {
            formatted += `${this.tabLines(indent, noIndent)}<![CDATA[${cdata}]]>`;
        });
        
        parser.on("opentag", tag => {
            let formattedTag = `<${tag.name}`; 

            const size = Object.keys(tag.attributes).length;

            if (size === 0) { // Is a regular closing tag
                if (tag.isSelfClosing) { formattedTag += `/`; }
                formattedTag += `>`;
                formatted += `${this.tabLines(indent, noIndent)}${formattedTag}`;

                if (!tag.isSelfClosing && !noIndent) { indent++; }
                if (tag.name === "p" && !tag.isSelfClosing) {
                    noIndent = true;
                }
                return;
            }
            for (const key in tag.attributes) {
                formattedTag += ` ${key}="${tag.attributes[`${key}`]}"`;
            }

            if (tag.isSelfClosing) { formattedTag += `/`; }
            formattedTag += `>`;
            formatted += `${this.tabLines(indent, noIndent)}${formattedTag}`;

            if (!noIndent) { indent++; }
            if (tag.name === "p" && !tag.isSelfClosing) {
                noIndent = true;
            }
        });
        
        parser.on("closetag", tag => {
            if (tag.name === "p") {
                console.log("");
            }

            if (tag.isSelfClosing) { return; } // This is already taken care of within the opentag handler
            if (!noIndent) { indent--; }
            if (tag.name === "p") { 
                noIndent = false;
                indent--;
            }
            
            if (formatted.charCodeAt(formatted.length - 1) === 10) { // If newline character at the end
                formatted += `${this.tabLines(indent, noIndent)}</${tag.name}>`;
            } else {
                formatted += `</${tag.name}>`;
            }
        });
        
        parser.on("comment", comment => {
            if (formatted.charCodeAt(formatted.length - 1) === 10) { // If newline character at the end
                formatted += `${this.tabLines(indent, noIndent)}<!--${comment}-->`;
            } else {
                formatted += `<!--${comment}-->`;
            }
        });
        
        parser.on("text", text => {
            if (noIndent) {
                let parsedText = text.replace(/[\t]/g, "");
                let splitArray = parsedText.split("\n");
                let temp = formatted;
                for (let i = 0; i < splitArray.length; i++) {
                    if (formatted.charCodeAt(formatted.length - 1) === 10) { // If newline character at the end
                        formatted += `${this.tabLines(indent, false)}${splitArray[i]}${i < splitArray.length - 1 ? `\n` : ``}`;
                    } else {
                        formatted += `${splitArray[i]}${i < splitArray.length - 1 ? `\n` : ``}`;
                    }
                }
                temp = formatted;
                return;
            }

            let parsedText = text.replace(/[\t]/g, "");
            if (parsedText === "") { return; }
            parsedText = he.encode(parsedText);
            
            if (formatted.charCodeAt(formatted.length - 1) === 10 || text.charCodeAt(0) === 10) {
            // if (formatted.substring(formatted.length - 1, formatted.length) === "\n" || text.substring(0, 2) === "\n") {
                formatted += `${this.tabLines(indent, false)}${parsedText}`;
            } else {
                formatted += `${parsedText}`;
            }
    });

        parser.write(document.getText(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).range.end.character)))).close();

        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            vscode.window.showErrorMessage("No workspace open");
            return;
        }
        const fileUri = vscode.Uri.joinPath(folder.uri, "formatted.xml");
        vscode.workspace.fs.writeFile(fileUri, Buffer.from(formatted, "utf8"));

        // console.log(JSON.stringify(formatted));

        return;
    }

    /**
     * Helper function to insert the correct nubmer of indents
     * @param numTabs Number of tabs to retun
     * @returns a string with numTab number of \t
     */
    tabLines(numTabs: number, noIndent: boolean): string {
        if (numTabs <= 0 || noIndent) { return ""; }
        let str = "";
        for (let i = 0; i < numTabs; i++) {
            str += "\t";
        }

        return str;
    }
}