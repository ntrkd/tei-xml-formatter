import { SaxesParser } from 'saxes';
import { ParentNode, ASTNode, DocumentNode, TagNode, TextNode, CloseTagNode, SpacePossibleNode } from './types/ast';
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


        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            vscode.window.showErrorMessage("No workspace open");
            return;
        }

        const astFile = vscode.Uri.joinPath(folder.uri, "ast.json");
        const dd = this.serializeNode(xmlDoc);
        vscode.workspace.fs.writeFile(astFile, Buffer.from(dd));

        this.mergeAdjacentTextNodes(xmlDoc);
        const sanitizedFile = vscode.Uri.joinPath(folder.uri, "sanitized.json");
        let saniReturn = this.sanitizer(xmlDoc, { left: false, right: false });
        let saniRoot: ASTNode = saniReturn[0][0];
        vscode.workspace.fs.writeFile(sanitizedFile, Buffer.from(this.serializeNode(saniRoot)));


        if (saniRoot instanceof DocumentNode) {
            let fmtTree = this.builder(saniRoot);
            const fmtFile = vscode.Uri.joinPath(folder.uri, "fmt.json");
            vscode.workspace.fs.writeFile(fmtFile, Buffer.from(this.serializeFmt(fmtTree)));

            const formatted = vscode.Uri.joinPath(folder.uri, "formatted.xml");
            vscode.workspace.fs.writeFile(formatted, Buffer.from(this.generate(fmtTree, 'Detect', 0)));
        }

        return;
    }
    
    sanitizer(node: ASTNode, spaceCarry: Carry): [ASTNode[], Carry] {
        let returnCarry = spaceCarry; // Is this necessary? Or should we set to false
        let nextChildCarry = { left: false, right: false };
        let childs: ASTNode[] = [];

        // visit child and construct child array if we have children
        if (this.isParentNode(node)) {
            for (let i = 0; i < node.children.length; i++) {
                let sanitizedReturn = this.sanitizer(node.children[i], nextChildCarry);

                // Realize the left carry as a possible space
                if (sanitizedReturn[1].left && i !== 0) {
                    childs.push(new SpacePossibleNode(null));
                }

                // If we are the first child, then the left carry needs to be a return arg
                if (i === 0) {
                    returnCarry.left = sanitizedReturn[1].left;
                }

                // Push the child into the parent
                sanitizedReturn[0].forEach(function (elem) {
                    childs.push(elem);
                });

                // We only carry the space to the next node if it is a close tag
                let j = i + 1;
                let rightCarried: boolean = false;
                if (j < node.children.length && node.children[j] instanceof CloseTagNode) {
                    nextChildCarry.right = sanitizedReturn[1].right;
                    rightCarried = true;
                }

                // If the right space has not been carried then realize it as a space
                if (!rightCarried) {
                    // We aren't the last node and its an inline TagNode
                    if (j < node.children.length && node.children[j] instanceof TagNode && !block.includes(node.children[j].name) && !(childs[childs.length - 1] instanceof SpacePossibleNode)) {
                        childs.push(new SpacePossibleNode(null));
                    }

                    // We are the last node
                    if (j === node.children.length) {
                        returnCarry.right = sanitizedReturn[1].right;
                    }
                }
            }
        }

        // visit the current node
        if (node instanceof TagNode) {
            if (node.name === "TEI") {
                console.log('h');
            }
            // If its a block tag the carry space will be consumed
            // Else we return it as a carry space
            if (block.includes(node.name)) {
                returnCarry.left = false;
                returnCarry.right = false;
            }

            // Return with return carry and the new parent node
            let returnArr: ASTNode[] = [];
            let tagNode: TagNode = new TagNode(node.name, node.attributes, node.selfClosing, null);

            // Push the children into the new node
            for (let i = 0; i < childs.length; i++) {
                tagNode.children.push(childs[i]);
            }

            // If the carry right / left is true add a space node on the right and left
            if (returnCarry.left) {
                returnArr.push(new SpacePossibleNode(null));
            }

            returnArr.push(tagNode);

            if (returnCarry.right) {
                returnArr.push(new SpacePossibleNode(null));
            }

            return [returnArr, returnCarry];
        } else if (node instanceof CloseTagNode) {
            let tagNode: CloseTagNode = new CloseTagNode(node.name, null);

            // If block node return carry false
            // Else return carry on the right 
            if (block.includes(node.name)) {
                returnCarry.left = false;
                returnCarry.right = false;
            }

            return [[tagNode], returnCarry];
        } else if (node instanceof TextNode) {
            if (node.text.includes("808")) {
                console.log('h');
            }

            // normalize spacing in the center
            let text: string = node.text.replace(/[\s\n\t]+/g, ' ');

            // if there are spaces on either end then trim them and insert space possible there then return the correct carry direction
            if (text.charAt(0) === ' ') {
                returnCarry.left = true;
            }

            if (text.charAt(text.length - 1) === ' ') {
                returnCarry.right = true;
            }

            text = text.trim();

            if (text === '') {
                return [[], returnCarry];
            } else {
                return [[new TextNode(text, null)], returnCarry];
            }

        } else if (node instanceof DocumentNode) {
            // Create an empty parent and add child to it
            let doc: DocumentNode = new DocumentNode();

            for (let i = 0; i < childs.length; i++) {
                doc.children.push(childs[i]);
            }
            
            return [[doc], returnCarry];
        }

        // TODO panic
        return [[], { left: false, right: false }];
    }

    mergeAdjacentTextNodes(parent: ParentNode) {
        const merged: ASTNode[] = [];

        for (const node of parent.children) {
            const last = merged[merged.length - 1];

            if (last instanceof TextNode && node instanceof TextNode) {
                // Merge text into the previous TextNode
                last.text += node.text;
            } else {
                merged.push(node);
                node.parent = parent;
            }
        }

        parent.children = merged;

        // Recurse into child ParentNodes
        for (const node of parent.children) {
            if (this.isParentNode(node)) {
                this.mergeAdjacentTextNodes(node);
            }
        }
    }

    // Iterative pre order DFS
    builder(astRoot: DocumentNode): Group {
        if (astRoot.children.length === 0) { return new Group([]); } // undefined check

        const fmtRoot: Group = new Group([]);
        const fmtStack: Group[] = [fmtRoot];

        const astStack: ASTNode[] = [astRoot];

        // Never insert spacing before this node
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

                if (block.includes(node.name)) {
                    if (!node.selfClosing) {
                        let nextTag = this.peekNextASTNode(node, astStack);
                        if (nextTag instanceof CloseTagNode) {
                            tagGroup.nodes.push(new Line());
                        } else {
                            tagGroup.nodes.push(new LineIndent());
                        }
                    } else {
                        tagGroup.nodes.push(new Line());
                    }
                }

                parent.nodes.push(tagGroup);
                if (!node.selfClosing) {
                    fmtStack.push(tagGroup);
                }
            } else if (node instanceof CloseTagNode) {
                let closeTag: string = `</${node.name}>`;
                let parent: Group = fmtStack[fmtStack.length - 1];
                let grandParent: Group = fmtStack[fmtStack.length - 2];

                parent.nodes.push(new Text(closeTag));
                fmtStack.pop();

                let nextTag = this.peekNextASTNode(node, astStack);
                if (block.includes(node.name) 
                    || (nextTag instanceof TagNode && block.includes(nextTag.name))) {
                    grandParent.nodes.push(new Line());
                } else if (nextTag instanceof CloseTagNode && block.includes(nextTag.name)) {
                    grandParent.nodes.push(new LineDeindent());
                }
            } else if (node instanceof TextNode) {
                let parent: Group = fmtStack[fmtStack.length - 1];

                if (node.text !== "") {
                    fmtStack[fmtStack.length - 1].nodes.push(new Text(node.text));
                }

                let nextTag = this.peekNextASTNode(node, astStack);
                if (nextTag instanceof TagNode && block.includes(nextTag.name)) {
                    parent.nodes.push(new Line());
                } else if (nextTag instanceof CloseTagNode && block.includes(nextTag.name)) {
                    parent.nodes.push(new LineDeindent());
                }
            } else if (node instanceof SpacePossibleNode) {
                fmtStack[fmtStack.length - 1].nodes.push(new SpaceOrLine());
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