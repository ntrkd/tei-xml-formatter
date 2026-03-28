import { SaxesParser } from 'saxes';
import { ParentNode, ASTNode, DocumentNode, TagNode, TextNode, CloseTagNode, SpacingNode, isParentNode, BaseParentNode } from './types/ast';
import { Group, Text, Line, LineIndent, LineDeindent, SpaceOrLine, FMTNode, Wrap } from './types/fmt';
import * as vscode from 'vscode';
import { Focus, Top, Zipper, Context, ZipperError, ZipperMod } from './types/zipper';
import { ChainNode, LinkedList } from './types/linkedList';

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
        // lets restart from 1 so each new format doesnt result in crazy long id counts
        SpacingNode.uniqueIDCount = 1;
        const saxes = new SaxesParser();        
        const he = require('he');

        let xmlDoc: DocumentNode = new DocumentNode();
        let stack: ParentNode[] = [ xmlDoc ];

        saxes.on("error", function(e) {
            console.error("There was an error: ", e);
        });

        saxes.on("processinginstruction", (pi) => {
            let parent: ParentNode = stack[stack.length - 1];
            parent.children.push(new TextNode(`<?${pi.target}${pi.body !== "" ? ` ${pi.body}` : ``}?>`, parent));
        });

        saxes.on("xmldecl", dec => { // Always the first line in the XML document
            let parent: ParentNode = stack[stack.length - 1];
            parent.children.push(new TextNode(`<?xml
            version="${dec.version}"${dec.encoding !== undefined ? `
            encoding="${dec.encoding}"` : ``}${dec.standalone !== undefined ? `
            standalone="${dec.standalone}"` : ``}?>`, parent));
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
                        parent.children.push(new SpacingNode(parent, false, false));
                    }

                    previousNode.text = joinedProcessedText;
                } else {
                    let spaceAtFirst = text.charAt(0) === " " ? true : false;
                    let spaceAtLast = text.charAt(text.length - 1) === " " ? true : false;
                    let textNode = new TextNode(text, parent); // Reference to edit obj later

                    // If text node is just a single space
                    if (textNode.text === " ") {
                        if (!(previousNode instanceof SpacingNode)) {
                            parent.children.push(new SpacingNode(parent, false, false));
                        }
                        return;
                    }

                    // If space at first, check if spacing node already exists with previous node else insert one
                    if (spaceAtFirst) {
                        textNode.text = textNode.text.substring(1);
                        if (!(previousNode instanceof SpacingNode)) {
                            parent.children.push(new SpacingNode(parent, false, false));
                        }
                    }

                    // Push text node
                    parent.children.push(textNode);

                    // If space at last, trim text and insert SpacingNode
                    if (spaceAtLast) {
                        textNode.text = textNode.text.substring(0, textNode.text.length - 1);
                        parent.children.push(new SpacingNode(parent, false, false));
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
        // this.printDocumentNodeInfo(xmlDoc, astFile);
        const xmlNodesPrint = this.serializeNode(xmlDoc);
        vscode.workspace.fs.writeFile(astFile, Buffer.from(xmlNodesPrint));

        let propogatedTree = this.propogateSpaces(xmlDoc);
        this.markFirstLastSpacingInTags(propogatedTree);

        const spaceZip = vscode.Uri.joinPath(folder.uri, "zip.json");
        // this.printZipperInfo(zipper, spaceZip);
        const serializedZip = this.serializeNode(propogatedTree);
        vscode.workspace.fs.writeFile(spaceZip, Buffer.from(serializedZip));

        const fmtTree = this.buildFormattingTree(propogatedTree);
        const fmtFile = vscode.Uri.joinPath(folder.uri, "fmt.json");
        // this.printZipperInfo(zipper, spaceZip);
        const serializedFmt = this.serializeFmt(fmtTree);
        vscode.workspace.fs.writeFile(fmtFile, Buffer.from(serializedFmt));

        let output = this.renderNode(fmtTree, false, 0);
        const formattedFile = vscode.Uri.joinPath(folder.uri, "fmt.xml");
        vscode.workspace.fs.writeFile(formattedFile, Buffer.from(output[0]));

        return;
    }

    // rendered string and indent number
    renderNode(node: FMTNode, parentWrap: boolean, indentLevel: number): [string, number] {
        const MAX_WDITH = 80;
        const INDENT_UNIT = '\t';
        const NEWLINE = '\n';

        let output = '';
        let nodeWrap: boolean = node.width() > MAX_WDITH;

        // if the parent is wrapping then every new group gets its own newline
        // if the parent decides to wrap, the child can decide to not wrap
        // if the parent decides to not wrap, every child (recursive) MUST not wrap
        if (node instanceof Group) {
            // call render node on all children and add em up
            for (const child of node.nodes) {
                let renderChild = this.renderNode(child, nodeWrap, indentLevel);
                output += renderChild[0];
                indentLevel = renderChild[1];
            } 
        } else if (node instanceof Text) {
           output += node.text;
        } else if (node instanceof SpaceOrLine) {
            if (parentWrap) {
                if (node.significance === "First") { indentLevel++; }
                else if (node.significance === "Last") { indentLevel--; }
                output += NEWLINE + INDENT_UNIT.repeat(indentLevel);
            } else {
                output += ' ';
            }
        } else if (node instanceof Line) {
            if (parentWrap) {
                if (node.significance === "First") { indentLevel++; }
                else if (node.significance === "Last") { indentLevel--; }
                output += NEWLINE + INDENT_UNIT.repeat(indentLevel);
            } else {
                output += " ";
            }
        } else if (node instanceof LineIndent) {
            if (parentWrap) {
                indentLevel++;
                output += NEWLINE + INDENT_UNIT.repeat(indentLevel);
            } else {
                output += " ";
            }
        } else if (node instanceof LineDeindent) {
            if (parentWrap) {
                indentLevel = Math.max(0, indentLevel - 1);
                output += NEWLINE + INDENT_UNIT.repeat(indentLevel);
            } else {
                output += " ";
            }
        }


        return [output, indentLevel];
    }

    buildFormattingTree(tree: ASTNode): Group {
        // first make a zipper
        let zipper = new Zipper<ASTNode>(
            new Focus<ASTNode>(tree), 
            new Context<ASTNode>(
                new LinkedList<ASTNode>(), 
                new Top(), 
                new Top(), 
                new LinkedList<ASTNode>()
            )
        );

        let fmtTree: Group = new Group([]);
        let fmtStack: Group[] = [ fmtTree ];

        // setup a loop to go until the end (!success)
        while (true) {
            // do logic
            let stackTop: Group = fmtStack[fmtStack.length - 1];
            // decide what type the current focus is
            let focus: ASTNode = zipper.focus.data;

            if (focus instanceof DocumentNode) {
                // this node renders to nothing
            } else if (focus instanceof TagNode) {
                // needs a new group attached, stack increased, and tag node textualized and added to the new group
                let attrStr = Object.entries(focus.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
                let tagText = `<${focus.name}${attrStr}${focus.selfClosing ? ' /' : ''}>`;
                let newGroup = new Group([new Text(tagText)]);
                stackTop.nodes.push(newGroup);
                if (!focus.selfClosing) {
                    fmtStack.push(newGroup);
                }
            } else if (focus instanceof CloseTagNode) {
                // textualized and added to most recent group, then pop the stack
                let closeText = `</${focus.name}>`;
                stackTop.nodes.push(new Text(closeText));
                fmtStack.pop();
            } else if (focus instanceof TextNode) {
                // just add as a text node
                stackTop.nodes.push(new Text(focus.text));
            } else if (focus instanceof SpacingNode) {
                // handled per 3b. in the algorithm spec
                let prevNode = zipper.peekPrevious();
                let nextNode = zipper.peekNext();
                let space: FMTNode;

                if (focus.onlySpace) {
                    space = new SpaceOrLine();
                    stackTop.nodes.push(space);
                // prev tag == open tag && next tag != close tag
                } else if (((prevNode !== null && (prevNode instanceof TagNode && !prevNode.selfClosing)) || prevNode === null)
                    && (nextNode === null || !(nextNode instanceof CloseTagNode))) {
                    space = new LineIndent();
                    stackTop.nodes.push(space);
                // prev tag != open tag && next tag == close tag
                } else if ((prevNode === null || (prevNode instanceof TagNode && prevNode.selfClosing) || !(prevNode instanceof TagNode))
                    && ((nextNode !== null && nextNode instanceof CloseTagNode)) || nextNode === null) {
                    space = new LineDeindent();
                    stackTop.nodes.push(space);
                } else {
                    space = new SpaceOrLine();
                    stackTop.nodes.push(space);
                }

                if (focus.firstInTag && !focus.lastInTag) {
                    space.significance = 'First';
                } else if (!focus.firstInTag && focus.lastInTag) {
                    space.significance = 'Last';
                }
            }


            let next = zipper.goNext();

            // check for break;
            if (!next.success) {
                break; // reached the end
            }

            // increment
            zipper = next.zipper;
        }

        return fmtTree;
    }

    private markFirstLastSpacingInTags(node: ASTNode): void {
        if (node instanceof TagNode) {
            // find first and last SpacingNode among this TagNodes children
            let firstSpacing: SpacingNode | null = null;
            let lastSpacing: SpacingNode | null = null;
            let lastSpace: SpacingNode | null = null;
            let numSpaces: number = 0;
            
            for (const child of node.children) {
                if (child instanceof SpacingNode) {
                    lastSpace = child;
                    numSpaces++;

                    if (firstSpacing === null) {
                        firstSpacing = child;
                    }
                    lastSpacing = child;
                }
            }

            // mark the space as lonely
            if (numSpaces === 1 && lastSpace !== null) {
                lastSpace.onlySpace = true;
            }
            
            // mark the first and last spacing nodes
            if (firstSpacing !== null) {
                firstSpacing.firstInTag = true;
            }
            if (lastSpacing !== null) {
                lastSpacing.lastInTag = true;
            }
        }
        
        // process children
        if (isParentNode(node)) {
            for (const child of node.children) {
                this.markFirstLastSpacingInTags(child);
            }
        }
    }

    propogateSpaces(tree: ASTNode): ASTNode {
        let zipper = new Zipper<ASTNode>(
            new Focus<ASTNode>(tree), 
            new Context<ASTNode>(
                new LinkedList<ASTNode>(), 
                new Top(), 
                new Top(), 
                new LinkedList<ASTNode>()
            )
        );

        // Carrying means inserting another Spacing node after the next node if the node in front of it can be crossed.
        // If we are carrying left, it can cross only open tags. If we are carrying right, it can cross only close tags.
        // If the Spacing node will reside next to another Spacing node, do not insert it.

        // define the current zipper which will be modified during loop
        let current: Zipper<ASTNode> = zipper;

        // For loop keep going next() until we hit the end
        while (true) {
            let next = current.goNext();
            if (next.success) {
                current = next.zipper;
            } else if (next.reason === ZipperError.AT_END) {
                break;
            } else {
                // TODO: This part should never trigger, lets post an error
            }

            // check if we are at SpacingNode
            let currNode = current.focus.data;
            if (currNode instanceof SpacingNode) {
                // if Spacing Node has propogateLeft as false
                if (!currNode.propogateLeft) {
                    while (true) {
                        let goPrev = current.goPrevious();
                        if (goPrev.success) {
                            current = goPrev.zipper;
                        } else {
                            break; // Reached the beginning, nothing to do
                        }

                        if (current.focus.data instanceof TagNode) {
                            // insert spacing node into left sibling tail
                            let peekPrev = current.peekPrevious();
                            if (!(peekPrev instanceof SpacingNode)) {
                                let parentVal: ASTNode | null = null;
                                if (!(current.context.parent_value instanceof Top) && isParentNode(current.context.parent_value)) { parentVal = current.context.parent_value; }

                                current.insertLeft(new SpacingNode(parentVal, true, true));

                                let goPrev = current.goPrevious();
                                if (goPrev.success) {
                                    current = goPrev.zipper;
                                } else {
                                    break; // Reached the beginning, nothing to do
                                }
                            }
                        } else {
                            currNode.propogateLeft = true;
                            break;
                        }
                    }
                } else if (!currNode.propogateRight) {
                    while (true) {
                        let goNext = current.goNext();
                        if (goNext.success) {
                            current = goNext.zipper;
                        } else {
                            break; // Reached the end
                        }

                        if (current.focus.data instanceof CloseTagNode) {
                            // insert SpaceNode to the right
                            let peekNext = current.peekNext();
                            if (peekNext === null || !(peekNext instanceof SpacingNode)) {
                                let parentVal: ParentNode | null = null;
                                if ( !(current.context.parent_value instanceof Top) && isParentNode(current.context.parent_value) ) {
                                    parentVal = current.context.parent_value;
                                }

                                if (current.context.parent_context instanceof Context) {
                                    current.context.parent_context.right_siblings.prepend(new SpacingNode(parentVal, true, true));
                                }
                            }
                        
                            let goNext = current.goNext();
                            if (goNext.success) {
                                current = goNext.zipper;
                            } else {
                                break; // This shouldn't happen because we just inserted a node after
                            }
                        } else {
                            currNode.propogateRight = true;
                            break;
                        }
                    }
                }

            }
        }
        
        // once all the looping is done, all spaces should be propogated

        let goTop = current.goTop();
        if (goTop.success) {
            return goTop.zipper.focus.data;
        } else {
            // TODO: This needs error handling, should never happen
            return current.focus.data;
        }
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

                // Inject instance name for AST nodes and ensure children is last
                if (value && typeof value === 'object') {
                    const ctor = value.constructor;
                    if (ctor && ctor !== Object) {
                        const result: any = { _type: ctor.name };

                        // copy over properties except children first
                        for (const [propName, propValue] of Object.entries(value)) {
                            if (propName === 'parent' || propName === 'children') {
                                continue;
                            }
                            result[propName] = propValue;
                        }

                        // append children at end if present
                        if ('children' in value) {
                            result.children = (value as any).children;
                        }

                        return result;
                    }
                }

                return value;
            },
            2
        );
    }
}