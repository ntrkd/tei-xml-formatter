import { SaxesParser } from 'saxes';
import { ParentNode, ASTNode, DocumentNode, TagNode, TextNode, CloseTagNode, SpacingNode, isParentNode } from './types/ast';
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
                        parent.children.push(new SpacingNode(parent, false, false));
                    }

                    previousNode.text += joinedProcessedText;
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
        const dd = this.serializeNode(xmlDoc);
        vscode.workspace.fs.writeFile(astFile, Buffer.from(dd));

        let zipper = new Zipper<ASTNode>(
            new Focus<ASTNode>(xmlDoc), 
            new Context<ASTNode>(
                new LinkedList<ASTNode>(), 
                new Top(), 
                new Top(), 
                new LinkedList<ASTNode>()
            )
        );

        zipper = this.propogateSpaces(zipper);

        const spaceZip = vscode.Uri.joinPath(folder.uri, "zip.json");
        const serializedZip = this.serializeNode(zipper.focus.data);
        vscode.workspace.fs.writeFile(spaceZip, Buffer.from(serializedZip));

        return;
    }

    propogateSpaces(zipper: Zipper<ASTNode>): Zipper<ASTNode> {
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

            // each iteration:
            // check if we are at SpacingNode
            let currNode = current.focus.data;
            if (currNode instanceof SpacingNode) {
                // if Spacing Node has propogateLeft as false
                if (!currNode.propogateLeft) {
                    // loop needs to run n + 1 times, and the last one it is just to insert right
                    // for every iteration we step back one, if insertRightNext true: do it and set false. Check if focus is crossable. If it is then set insertRightNext true.
                    let insertRightNext: boolean = false;
                    let backwardLoopVar: boolean = true;
                    while (backwardLoopVar) {
                        // TODO: messy logic. Having parent values be possibly null is not the best solution
                        if (insertRightNext) {
                            // Check that SpacingNodes do not already exist
                            let immediateRightSib: ChainNode<ASTNode> | null = current.context.right_siblings.getHead();
                            // TODO: This logic needs looking over again
                            if ((immediateRightSib === null || !(immediateRightSib.data instanceof SpacingNode))) {
                            // if ( !(rightmostSib !== null && rightmostSib.data instanceof SpacingNode) ) { 
                                let parentVal: ParentNode | null = null;
                                if ( !(current.context.parent_value instanceof Top) && isParentNode(current.context.parent_value) ) { parentVal = current.context.parent_value; }

                                // when we come back do not try and propogate this node
                                current.insertRight(new SpacingNode(parentVal, true, true));
                            }

                            insertRightNext = false;
                        }

                        // the spacing node IS the focus
                        // first step left, check if is open tag. if yes, set insert_right_next as true
                        let stepPrevious = current.goPrevious();
                        if (stepPrevious.success) {
                            current = stepPrevious.zipper;
                            if (stepPrevious.zipper.focus.data instanceof TagNode) {
                                insertRightNext = true;
                            } else {
                                // TODO: check this logic later
                                backwardLoopVar = false;
                            }
                        } else {
                            // TODO: This might need to be handled as an error. Break immediately?
                            break;
                        }
                    }

                    // Finish node
                    currNode.propogateLeft = true;
                } else if (!currNode.propogateRight) {
                    // for every iteration we step forward one, if insertLeftNext true: do it and set false. Check if focus is crossable. If it is then set insertLeftNext true.
                    let insertLeftNext: boolean = false;
                    let forwardLoopVar: boolean = true;
                    while (forwardLoopVar) {
                        // TODO: messy logic. Having parent values be possibly null is not the best solution
                        if (insertLeftNext) {
                            // Check that SpacingNodes do not already exist
                            let immediateLeftSib: ChainNode<ASTNode> | null = current.context.left_siblings.getTail();
                            // TODO: This logic needs looking over again
                            if ((immediateLeftSib === null || !(immediateLeftSib.data instanceof SpacingNode))) {
                                let parentVal: ParentNode | null = null;
                                if ( !(current.context.parent_value instanceof Top) && isParentNode(current.context.parent_value) ) { parentVal = current.context.parent_value; }

                                // when we come back do not try and propogate this node
                                current.insertLeft(new SpacingNode(parentVal, true, true));
                            }

                            insertLeftNext = false;
                        }

                        // the spacing node IS the focus
                        // first step forward, check if is close tag. if yes, set insertLeftNext as true
                        let stepForward = current.goNext();
                        if (stepForward.success) {
                            current = stepForward.zipper;
                            if (stepForward.zipper.focus.data instanceof CloseTagNode) {
                                insertLeftNext = true;
                            } else {
                                // TODO: check this logic later
                                forwardLoopVar = false;
                            }
                        } else {
                            // TODO: This might need to be handled as an error. Break immediately?
                            break;
                        }

                    }
                
                    currNode.propogateRight = true;
                }

            }
        }
        
        // once all the looping is done, all spaces should be propogated
        // return current: Zipper<ASTNode> after going all the way to the top

        
        let goTop = current.goTop();
        if (goTop.success) {
            return goTop.zipper;
        } else {
            // TODO: This needs error handling, should never happen
            return current;
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