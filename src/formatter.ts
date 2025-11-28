import * as vscode from 'vscode';
import { SaxesParser } from 'saxes';
import { Group, Text, SpaceOrLine, LineIndent } from './types/Nodes';
import { parse } from 'path';

export class Formatter implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        const parser = new SaxesParser();
        const he = require("he");

        const pLike: string[] = ["head", "p"];
        let inPLike: boolean = false;

        /**
         * The document as a formatting tree
         */
        let root: Group = new Group([]);
        

        parser.on("error", function (e) {
            console.error(e);
            vscode.window.showErrorMessage("Error: " + e.message); // TODO: Make better
            return;
        });
        
        parser.on("xmldecl", dec => { // Always the first line in the XML document
            let grp: Group = new Group([new Text("<?xml")]);

            if (dec.version !== undefined) {
                grp.nodes.push(new SpaceOrLine());
                grp.nodes.push(new Text(`version="${dec.version}"`));
            }

            if (dec.encoding !== undefined) {
                grp.nodes.push(new SpaceOrLine());
                grp.nodes.push(new Text(`encoding="${dec.encoding}"`));
            }

            if (dec.standalone !== undefined) {
                grp.nodes.push(new SpaceOrLine());
                grp.nodes.push(new Text(`standalone="${dec.standalone}"`));
            }

            grp.nodes.push(new Text("?>"));

            root.nodes.push(grp);
        });
        
        parser.on("doctype", doc => {
            // TODO: make sure that the doc string has the space between DOCTYPE and the body
            // TODO: Actually push this into the tree

            let text: Text = new Text(`<!DOCTYPE${doc}>`); // Ignoring wrapping for now
        });
        
        parser.on("processinginstruction", pi => {
            // TODO
            // const node: Node = {
            //     type: "PI",
            //     body: `<?${pi.target}${pi.body !== "" ? ` ${pi.body.replace(/[\n\t]/g,"")}` : ``}?>`,
            //     closed: true,
            //     parent: stack[stack.length - 1],
            //     children: []
            // };

            // stack[stack.length - 1].children.push(node);
        });
        
        parser.on("cdata", cdata => {
            // TODO
            // const node: Node = {
            //     type: "CData",
            //     body: `<![CDATA[${cdata}]]>`,
            //     closed: true,
            //     parent: stack[stack.length - 1],
            //     children: []
            // };
            
            // stack[stack.length - 1].children.push(node);
        });
        
        parser.on("opentag", tag => {
            // Check for pLike
            if (pLike.includes(tag.name)) {
                root.nodes.push(new LineIndent);
                inPLike = true;
            }

            // Check if we are not in pLike to auto indent
            if (!inPLike) {
                root.nodes.push(new LineIndent);
            }

            let grp: Group = new Group([]);
            let body: string = `<${tag.name}`;

            for (const key in tag.attributes) {
                body += ` ${key}="${tag.attributes[`${key}`]}"`;
            }

            if (tag.isSelfClosing) {
                body += "/>";
            } else {
                body += ">";
            }

            grp.nodes.push(new Text(body));
            root.nodes.push(grp);
        });
        
        parser.on("closetag", tag => {
            if (tag.isSelfClosing) { return; } // Self closing is handled in opentag event

            root.nodes.push(new Text(`</${tag.name}>`));
        });
        
        parser.on("comment", comment => {
            // TODO
            // const node: Node = {
            //     type: "Comment",
            //     body: `<!--${comment}-->`,
            //     closed: true,
            //     parent: stack[stack.length - 1],
            //     children: []
            // };

            // stack[stack.length - 1].children.push(node);
        });
        
        parser.on("text", text => {
            let parsed: string = text.replace(/[ \t\n]+/g, " ");

            if (parsed === " " && inPLike && root.nodes[root.nodes.length - 1].kind !== "SpaceOrLine") {
                root.nodes.push(new SpaceOrLine);
                return;
            } else if (!inPLike && parsed === " ") {
                return;
            }

            root.nodes.push(new Text(parsed));

            // const node: Node = {
            //     type: "Text",
            //     // body: text.replace(/[ \t\n]+/g, " "), // Normalize all spaces to one
            //     body: text,
            //     closed: true,
            //     parent: stack[stack.length - 1],
            //     children: []
            // };

            // stack[stack.length - 1].children.push(node);
        });

        parser.write(document.getText(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).range.end.character)))).close();

        // console.log(JSON.stringify(parentStack, (key, value) => {
        //     if (key === "parent") { return undefined; } // skip parent to avoid circular refs
        //     return value;
        //     }, 2));

        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            vscode.window.showErrorMessage("No workspace open");
            return;
        }
        
        const fileUri = vscode.Uri.joinPath(folder.uri, "formatted.json");
        vscode.workspace.fs.writeFile(fileUri, Buffer.from(JSON.stringify(root, (key, value) => {
            if (key === "parent") { return undefined; } // skip parent to avoid circular refs
            return value;
            }, 2), "utf8"));

        return;
    }
}
