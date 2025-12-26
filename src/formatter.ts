import { SaxesParser } from 'saxes';
import { ParentNode, ASTNode, DocumentNode, TagNode, TextNode, CloseTagNode, SpacePossibleNode } from './types/ast';
import { Group, Text, Line, LineIndent, LineDeindent, SpaceOrLine, FMTNode, Wrap } from './types/fmt';
import * as vscode from 'vscode';
import { platform } from 'os';
import { emit } from 'process';
import { json } from 'stream/consumers';

// Define what tags are considered <p> like
const pLike: string[] = ["head", "p"];

const block: string[] = ["head", "p", "div", "body", "text", "TEI"];
const inline: string[] = ["hi", "note", "salute", "signed"];
const blockTags = new Set([
    "p", "div", "section", "article", "ul", "ol", "li",
    "table", "tr", "td", "th", "blockquote", "head", "text", "TEI", "bod"
]);

interface Carry {
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

        const sanitized = this.sanitizeAST(xmlDoc);
        const sanitizeOutput = vscode.Uri.joinPath(folder.uri, "sanitized.json");
        vscode.workspace.fs.writeFile(sanitizeOutput, Buffer.from(this.serializeNode(sanitized)));

        const newFmtTree = this.builder(sanitized); 
        const newFmt = vscode.Uri.joinPath(folder.uri, "newfmt.json");
        vscode.workspace.fs.writeFile(newFmt, Buffer.from(this.serializeFmt(newFmtTree)));
        const generatedString = this.generate(newFmtTree, 'Detect', 0);
        const newO = vscode.Uri.joinPath(folder.uri, "newoutput.xml");
        vscode.workspace.fs.writeFile(newO, Buffer.from(generatedString));


        this.emitter(xmlDoc);

        return;
    }

    isPureSpace(text: string) {
    return /^[\s]+$/.test(text);
    }

    hasLeftSpace(text: string) {
    return /^\s/.test(text);
    }

    hasRightSpace(text: string) {
    return /\s$/.test(text);
    }

    stripLeft(text: string) {
    return text.replace(/^\s+/, "");
    }

    stripRight(text: string) {
    return text.replace(/\s+$/, "");
    }

    sanitizeAST(root: DocumentNode): DocumentNode {
        this.sanitizeParent(root);
        return root;
    }

    sanitizeParent(parent: ParentNode) {
        let carryRight = false;
        const newChildren: ASTNode[] = [];

        for (let i = 0; i < parent.children.length; i++) {
            const child = parent.children[i];

            const { node, carry } = this.sanitizeNode(child, parent, carryRight);

            // insert carried-left space before node
            if (carry.left) {
            newChildren.push(new SpacePossibleNode(parent));
            }

            newChildren.push(node);

            carryRight = carry.right;
        }

        // trailing carried-right space dies at container boundary
        parent.children = newChildren;
    }

    sanitizeNode(
        node: ASTNode,
        parent: ParentNode,
        carryIn: boolean
        ): { node: ASTNode; carry: { left: boolean; right: boolean } } {

        // ─────────────────────────────────────────────
        // TEXT NODE
        // ─────────────────────────────────────────────
        if (node instanceof TextNode) {
            let text = node.text;
            let carryLeft = false;
            let carryRight = false;

            // incoming carry meets text
            if (carryIn && this.hasLeftSpace(text)) {
            text = this.stripLeft(text);
            carryLeft = false;
            carryRight = false;
            return {
                node: new TextNode(text, parent),
                carry: { left: false, right: false }
            };
            }

            // pure spacing → carry both sides
            if (this.isPureSpace(text)) {
            return {
                node: new TextNode("", parent),
                carry: { left: true, right: true }
            };
            }

            // leading space
            if (this.hasLeftSpace(text)) {
            text = this.stripLeft(text);
            carryLeft = true;
            }

            // trailing space
            if (this.hasRightSpace(text)) {
            text = this.stripRight(text);
            carryRight = true;
            }

            return {
            node: new TextNode(text, parent),
            carry: { left: carryLeft, right: carryRight }
            };
        }

        // ─────────────────────────────────────────────
        // TAG NODE
        // ─────────────────────────────────────────────
        if (node instanceof TagNode) {
            this.sanitizeParent(node);

            // block tag kills all carry
            if (blockTags.has(node.name)) {
            return {
                node,
                carry: { left: false, right: false }
            };
            }

            // carry-right hitting open tag → stop and insert
            if (carryIn) {
            return {
                node,
                carry: { left: true, right: false }
            };
            }

            return {
            node,
            carry: { left: false, right: false }
            };
        }

        // ─────────────────────────────────────────────
        // CLOSE TAG
        // ─────────────────────────────────────────────
        if (node instanceof CloseTagNode) {
            // carry-left hitting close tag → stop and insert
            if (carryIn) {
            return {
                node,
                carry: { left: false, right: true }
            };
            }

            return {
            node,
            carry: { left: false, right: false }
            };
        }

        // ─────────────────────────────────────────────
        // FALLTHROUGH
        // ─────────────────────────────────────────────
        return {
            node,
            carry: { left: false, right: false }
        };
    }

    emitter(astRoot: DocumentNode): Group {
        if (astRoot.children.length === 0) { return new Group([]); } // undefined check

        let holdingStack: ASTNode[] = [astRoot];
        let postOrderStack: ASTNode[] = [];

        while (holdingStack.length > 0) {
            let popped: ASTNode = holdingStack.pop()!;
            postOrderStack.push(popped);

            if (this.isParentNode(popped)) {
                popped.children.forEach(child => {
                    holdingStack.push(child);
                });
            }
        }

        while (postOrderStack.length > 0) {
            let elem = postOrderStack.pop()!;
            if (elem instanceof TagNode) {
                console.log(postOrderStack.length, elem.name);
            }
            if (elem instanceof CloseTagNode) {
                console.log(postOrderStack.length, elem.name);
            }
            if (elem instanceof TextNode) {
                console.log(postOrderStack.length, JSON.stringify(elem.text));
            }
            if (elem instanceof DocumentNode) {
                console.log("Document");
            }
        }

        return new Group([]);
    }

    // Iterative pre order DFS
    builder(astRoot: DocumentNode): Group {
        if (astRoot.children.length === 0) { return new Group([]); } // undefined check

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

                if (blockTags.has(node.name)) {
                    parent.nodes.push(new Line());
                }

                tagGroup.nodes.push(new Text(tagBody));

                if (blockTags.has(node.name)) {
                    tagGroup.nodes.push(new LineIndent());
                }

                parent.nodes.push(tagGroup);
                if (!node.selfClosing) {
                    fmtStack.push(tagGroup);
                }
            } else if (node instanceof CloseTagNode) {
                let closeTag: string = `</${node.name}>`;
                let parent: Group = fmtStack[fmtStack.length - 1];
                let grandParent: Group = fmtStack[fmtStack.length - 2];

                if (blockTags.has(node.name)) {
                    parent.nodes.push(new LineDeindent());
                }

                parent.nodes.push(new Text(closeTag));
                fmtStack.pop();

                if (blockTags.has(node.name)) {
                    grandParent.nodes.push(new Line());
                }
            } else if (node instanceof TextNode) {
                if (node.text !== "") {
                    fmtStack[fmtStack.length - 1].nodes.push(new Text(node.text));
                }
            } else if (node instanceof SpacePossibleNode) {
                fmtStack[fmtStack.length - 1].nodes.push(new Line());
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