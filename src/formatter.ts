import { SaxesParser } from 'saxes';
import { ParentNode, ASTNode, DocumentNode, TagNode, TextNode, CloseTagNode, SpacingNode } from './types/ast';
import { Group, Text, Line, LineIndent, LineDeindent, SpaceOrLine, FMTNode, Wrap } from './types/fmt';
import * as vscode from 'vscode';

// Define what tags are considered <p> like
const pLike: string[] = ["head", "p"];

const block: string[] = ["head", "p", "div", "body", "text", "TEI", "section"];
const inline: string[] = ["hi", "note", "salute", "signed"];

type Carry = {
    left: boolean;
  right: boolean;
}

export class Formatter implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        const saxes = new SaxesParser();        
        const he = require('he');

        let xmlDoc: DocumentNode = new DocumentNode();
        let stack: ParentNode[] = [ xmlDoc ];

        saxes.on("error", function(e) {
            console.error("There was an error: ", e);
        });

        saxes.on("opentag", function(tag) {
            let parent: ParentNode = stack[stack.length - 1];
            let node: TagNode = new TagNode(tag.name, tag.isSelfClosing, tag.attributes, undefined, parent);
            parent.children.push(node);
            if (!tag.isSelfClosing) {
                stack.push(node);
            }
        });

        saxes.on("closetag", function(tag) {
            if (stack.length !== 0 && !tag.isSelfClosing) {
                let openTag: ParentNode = stack.pop()!;
                if (openTag instanceof TagNode) {
                    openTag.children.push(new CloseTagNode(tag.name, openTag));
                }
            }
        });

        saxes.on("text", function(text) {
            text = text.replace(/[\n\t ]+/g, ' ');

            if (text !== "") {
                let parent: ParentNode = stack[stack.length - 1];
                let previousNode: ASTNode = parent.children[parent.children.length - 1];

                if (previousNode instanceof TextNode) {
                    let joinedProcessedText = (previousNode.text + text).replace(/[\n\t ]+/g, ' ');

                    // Previous node would already have had the beginning space transformed into a SpacingNode already
                    // So just check the ending
                    if (joinedProcessedText.charAt(joinedProcessedText.length - 1) === " ") {
                        // Edit to remove the space
                        joinedProcessedText = joinedProcessedText.substring(0, joinedProcessedText.length - 1);

                        // Push SpacingNode
                        parent.children.push(new SpacingNode(parent));
                    }

                    previousNode.text += joinedProcessedText;
                } else {
                    let spaceAtFirst = text.charAt(0) === " " ? true : false;
                    let spaceAtLast = text.charAt(text.length - 1) === " " ? true : false;
                    let textNode = new TextNode(text, parent); // Reference to edit obj later

                    // If text node is just a single space
                    if (textNode.text === " ") {
                        if (!(previousNode instanceof SpacingNode)) {
                            parent.children.push(new SpacingNode());
                        }
                        return;
                    }

                    // If space at first, check if spacing node already exists with previous node else insert one
                    if (spaceAtFirst) {
                        textNode.text = textNode.text.substring(1);
                        if (!(previousNode instanceof SpacingNode)) {
                            parent.children.push(new SpacingNode);
                        }
                    }

                    // Push text node
                    parent.children.push(textNode);

                    // If space at last, trim text and insert SpacingNode
                    if (spaceAtLast) {
                        textNode.text = textNode.text.substring(0, textNode.text.length - 1);
                        parent.children.push(new SpacingNode());
                    }
                }}
        });

        saxes.write(document.getText()).close();


        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            vscode.window.showErrorMessage("No workspace open");
            return;
        }

        const astFile = vscode.Uri.joinPath(folder.uri, "ast.json");
        const dd = this.serializeNode(xmlDoc);
        vscode.workspace.fs.writeFile(astFile, Buffer.from(dd));

        return;
    }
    

    serializeFmt(node: FMTNode): string {
        // Custom replacer to skip the parent property
        return JSON.stringify(node, (key, value) => {
            if (key === 'parent') { return undefined; } // skip circular reference
            return value;
        }, 2); // 2-space indentation for readability
    }

    serializeNode(node: ASTNode): string {
        return JSON.stringify(
            node,
            (key, value) => {
                // Remove circular reference
                if (key === 'parent') { return undefined; };

                // Inject instance name for AST nodes
                if (value && typeof value === 'object') {
                    const ctor = value.constructor;
                    if (ctor && ctor !== Object) {
                        return {
                            _type: ctor.name,
                            ...value
                        };
                    }
                }

                return value;
            },
            2
        );
    }
}