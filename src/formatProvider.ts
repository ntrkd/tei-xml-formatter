import * as vscode from 'vscode';
import { Formatter } from '../packages/texfmt/src/formatter';

const block: string[] = ["head", "p", "div", "body", "text", "TEI", "section"];
const inline: string[] = ["hi", "note", "salute", "signed"];

export class TEIXMLFormatterProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        let texfmt = new Formatter();
        let formattedText = texfmt.format(document.getText());
        return [vscode.TextEdit.replace(new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), formattedText)];


        // const folder = vscode.workspace.workspaceFolders?.[0];
        // if (!folder) {
        //     vscode.window.showErrorMessage("No workspace open");
        //     return;
        // }

        // const astFile = vscode.Uri.joinPath(folder.uri, "ast.json");
        // // this.printDocumentNodeInfo(xmlDoc, astFile);
        // const xmlNodesPrint = this.serializeNode(xmlDoc);
        // vscode.workspace.fs.writeFile(astFile, Buffer.from(xmlNodesPrint));

        // let propogatedTree = this.propogateSpaces(xmlDoc);
        // this.markFirstLastSpacingInTags(propogatedTree);

        // const spaceZip = vscode.Uri.joinPath(folder.uri, "zip.json");
        // // this.printZipperInfo(zipper, spaceZip);
        // const serializedZip = this.serializeNode(propogatedTree);
        // vscode.workspace.fs.writeFile(spaceZip, Buffer.from(serializedZip));

        // const fmtTree = this.buildFormattingTree(propogatedTree);
        // const fmtFile = vscode.Uri.joinPath(folder.uri, "fmt.json");
        // // this.printZipperInfo(zipper, spaceZip);
        // const serializedFmt = this.serializeFmt(fmtTree);
        // vscode.workspace.fs.writeFile(fmtFile, Buffer.from(serializedFmt));

        // let output = this.renderNode(fmtTree, false, 0);
        // const formattedFile = vscode.Uri.joinPath(folder.uri, "fmt.xml");
        // vscode.workspace.fs.writeFile(formattedFile, Buffer.from(output[0]));

        return;
    }
}