import { SaxesParser } from 'saxes';
import { ParentNode, ASTNode, DocumentNode, TagNode, TextNode, CloseTagNode } from './types/ast';
import { Group, Text, Line, LineIndent, LineDeindent, SpaceOrLine, FMTNode, Wrap } from './types/fmt';
import * as vscode from 'vscode';
import { platform } from 'os';

// Define what tags are considered <p> like
const pLike: string[] = ["head", "p"];

export class Formatter implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): vscode.ProviderResult<vscode.TextEdit[]> {
        const saxes = new SaxesParser();        
        const he = require('he');

        let xmlDoc: DocumentNode = new DocumentNode();
        let stack: ParentNode[] = [ xmlDoc ];

        let inPLike: boolean = false;

        saxes.on("error", function(e) {
            console.error("There was an error: ", e);
        });

        saxes.on("opentag", function(tag) {
            if (pLike.includes(tag.name)) { inPLike = true; }

            let parent: ParentNode = stack[stack.length - 1];
            let node: TagNode = new TagNode(tag.name, tag.attributes, tag.isSelfClosing, parent);
            parent.children.push(node);
            if (!tag.isSelfClosing) {
                stack.push(node);
            }
        });

        saxes.on("closetag", function(tag) {
            if (pLike.includes(tag.name)) { inPLike = false; }

            if (stack.length !== 0 && !tag.isSelfClosing) {
                let openTag: ParentNode = stack.pop()!;
                if (openTag instanceof TagNode) {
                    openTag.children.push(new CloseTagNode(tag.name, openTag));
                }
            }
        });

        saxes.on("text", function(text) {
            // if (!inPLike) {
                // text = text.replace(/^[\s\t\n]+|[\s\t\n]+$|[\n\t]+/g, '');
            // }
            // text = text.replace(/[\n\t ]+/g, ' ');

            if (text !== "") {
                let parent: ParentNode = stack[stack.length - 1];
                parent.children.push(new TextNode(text, parent));
            }
        });

        saxes.write(document.getText()).close();

        console.log(xmlDoc.children.length);
        let fmtTree = this.builder(xmlDoc);

        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            vscode.window.showErrorMessage("No workspace open");
            return;
        }

        const astFile = vscode.Uri.joinPath(folder.uri, "ast.json");
        const dd = this.serializeNode(xmlDoc);
        vscode.workspace.fs.writeFile(astFile, Buffer.from(dd));

        const fmtFile = vscode.Uri.joinPath(folder.uri, "fmt.json");
        vscode.workspace.fs.writeFile(fmtFile, Buffer.from(this.serializeFmt(fmtTree)));

        const formatted = vscode.Uri.joinPath(folder.uri, "formatted.xml");
        vscode.workspace.fs.writeFile(formatted, Buffer.from(this.generate(fmtTree, 'Detect', 0)));

        return;
    }

    // Iterative pre order DFS
    builder(astRoot: DocumentNode): Group {
        console.log(astRoot.children.length);
        if (astRoot.children.length === 0) { return new Group([]); } // undefined check

        let inPLike: boolean = false;

        const fmtRoot: Group = new Group([]);
        const fmtStack: Group[] = [fmtRoot];

        const astStack: ASTNode[] = [astRoot];

        while (astStack.length > 0) {
            const node = astStack.pop();

            // Process node
            if (node instanceof TagNode) {
                let parent: Group = fmtStack[fmtStack.length - 1];
                let tagGroup: Group = new Group([]);
                let tagBody: string = `<${node.name}`;

                for (const key in node.attributes) {
                    tagBody += ` ${key}="${node.attributes[key]}"`;
                }

                if (node.selfClosing) {
                    tagBody += "/>";
                } else {
                    tagBody += ">";
                }

                tagGroup.nodes.push(new Text(tagBody));
                parent.nodes.push(tagGroup);
                if (!node.selfClosing) {
                    fmtStack.push(tagGroup);
                }

                // Push line nodes for spacing
                if (!inPLike) {
                    let nextNode: ASTNode = this.peekNextASTNode(node, astStack);
                    if (nextNode instanceof CloseTagNode) {
                        tagGroup.nodes.push(new Line());
                    } else {
                        tagGroup.nodes.push(new LineIndent());
                    }
                }

                if (pLike.includes(node.name)) {
                    inPLike = true;
                }
            } else if (node instanceof CloseTagNode) {
                let closeTag: string = `</${node.name}>`;
                let parent: Group = fmtStack[fmtStack.length - 1];
                let grandParent: Group = fmtStack[fmtStack.length - 2];

                if (pLike.includes(node.name)) {
                    inPLike = false;
                    if (node.parent.children.length > 1) {
                        parent.nodes.push(new LineDeindent());
                    }
                }

                parent.nodes.push(new Text(closeTag));
                fmtStack.pop();

                if (!inPLike) {
                    let nextNode: ASTNode = this.peekNextASTNode(node, astStack);
                    if (nextNode instanceof CloseTagNode) {
                        grandParent.nodes.push(new LineDeindent());
                    } else {
                        grandParent.nodes.push(new Line());
                    }
                }
            } else if (node instanceof TextNode) {
                fmtStack[fmtStack.length - 1].nodes.push(new Text(node.text));
                if (!inPLike) {
                    let nextNode: ASTNode = this.peekNextASTNode(node, astStack);
                    let parent: Group = fmtStack[fmtStack.length - 1];

                    if (nextNode instanceof CloseTagNode) {
                        parent.nodes.push(new LineDeindent());
                    } else if (nextNode instanceof TagNode) {
                        parent.nodes.push(new Line());
                    }
                }
            } else if (node instanceof DocumentNode) {
                // Do nothing, we wait for children to be loaded into the stack
            }

            // If current node is a tag node and has no children = it is a self closing tag
            // If the current node is a tag node and we are at the last child, the next 

            if (node instanceof TagNode || node instanceof DocumentNode) {
                for (let i = node.children.length - 1; i >= 0; i--) {
                    astStack.push(node.children[i]);
                }
            }
        }

        return fmtRoot;
    }

    peekNextASTNode(currentNode: ASTNode, stack: ASTNode[]): ASTNode {
        // If current node has children, return its first child
        if (this.isParentNode(currentNode) && currentNode.children.length > 0) {
            return currentNode.children[0];
        }

        // Otherwise, return the top of the stack
        return stack[stack.length - 1];
    }

    generate(fmtTreeRoot: FMTNode, wrap: Wrap, indent: number): string {
        if (fmtTreeRoot instanceof Group) {
            if (fmtTreeRoot.nodes[0].kind === "Text") {
                if (fmtTreeRoot.nodes[0].text === "<title>") {
                    console.log("");
                }
            }
        }

        // If the parent Group node is NoWrap all child group nodes inherit it.
        // If the parent Group node is Detect or Wrap, the child Group needs to determine its own Wrap mode

        let formatted: string = "";
        const maxWidth: number = 80;

        const newLine = (indent: number): string => {
            return "\n" + "\t".repeat(indent);
        };

        // If wrap is set to detect, determine wrap type
        let test = fmtTreeRoot.width(); // TOOD DELETE
        let shouldWrap = fmtTreeRoot.width() > maxWidth;
        if (wrap === 'Detect') {
            if (shouldWrap) {
                wrap = 'Wrap';
            } else {
                wrap = 'NoWrap';
            }
        // A parent group mode of Wrap should not force Wrap on a child group. It must determine its own wrap mode.
        // If the parent is no wrap, the child will not require wrap either so leave as is
        } else if (wrap === 'Wrap' && fmtTreeRoot instanceof Group) {
            if (!shouldWrap) {
                wrap = "NoWrap";
            }
        }

        if (fmtTreeRoot instanceof Group) {
            fmtTreeRoot.nodes.forEach(node => {
                if (node instanceof LineIndent) {
                    indent++;
                } else if (node instanceof LineDeindent) {
                    indent = Math.max(0, indent - 1);
                }
                
                formatted += this.generate(node, wrap, indent);
            });
        }

        if (fmtTreeRoot instanceof Text) {
            return fmtTreeRoot.text;
        }

        if (fmtTreeRoot instanceof SpaceOrLine) {
            if (wrap === 'Wrap') {
                return newLine(indent);
            } else if (wrap === 'NoWrap') {
                return " ";
            }
        }

        if (fmtTreeRoot instanceof Line || fmtTreeRoot instanceof LineIndent || fmtTreeRoot instanceof LineDeindent) {
            if (wrap === 'Wrap') {
                return newLine(indent);
            } else if (wrap === 'NoWrap') {
                return "";
            }
        }

        return formatted;
    }

    /**
     * Returns whether the given AST Node can have children
     * @param node ASTNode to check
     * @returns boolean
     */
    isParentNode(node: ASTNode): node is ASTNode & ParentNode {
        return Array.isArray((node as any).children);
    }


    serializeFmt(node: FMTNode): string {
        // Custom replacer to skip the parent property
        return JSON.stringify(node, (key, value) => {
            if (key === 'parent') { return undefined; } // skip circular reference
            return value;
        }, 2); // 2-space indentation for readability
    }

    serializeNode(node: ASTNode): string {
        // Custom replacer to skip the parent property
        return JSON.stringify(node, (key, value) => {
            if (key === 'parent') { return undefined; } // skip circular reference
            return value;
        }, 2); // 2-space indentation for readability
    }
}