import { SaxesParser } from 'saxes';
import { DocumentNode, TagNode, TextNode, CloseTagNode, SpacingNode, isParentNode } from './ast';
import { type ParentNode, type ASTNode } from './ast';
import { Group, Text, Line, LineIndent, LineDeindent, SpaceOrLine } from './fmt';
import { type FMTNode } from "./fmt";
import { Focus, Top, Zipper, Context, ZipperError } from './dataStructures/zipper';
import { LinkedList } from './dataStructures/linkedList';

export class Formatter {
    private saxes: SaxesParser;

    constructor() {
        this.saxes = new SaxesParser();
    }

    public format(doc: string): string {
        // lets restart from 1 so each new format doesnt result in crazy long id counts
        SpacingNode.uniqueIDCount = 1;
        // const he = require('he');

        let xmlDoc: DocumentNode = new DocumentNode();
        let stack: ParentNode[] = [ xmlDoc ];

        this.saxes.on("error", function(e) {
            console.error("There was an error: ", e);
        });

        this.saxes.on("processinginstruction", (pi) => {
            let parent: ParentNode | undefined = stack[stack.length - 1];
            if (!parent) { 
                throw new Error("Expected element in ParentNode stack but was empty"); 
            }

            parent.children.push(new TextNode(`<?${pi.target}${pi.body !== "" ? ` ${pi.body}` : ``}?>`, parent));
        });

        this.saxes.on("xmldecl", dec => { // Always the first line in the XML document
            let parent: ParentNode | undefined = stack[stack.length - 1];
            if (!parent) { 
                throw new Error("Expected element in ParentNode stack but was empty"); 
            }

            parent.children.push(new TextNode(`<?xml
            version="${dec.version}"${dec.encoding !== undefined ? `
            encoding="${dec.encoding}"` : ``}${dec.standalone !== undefined ? `
            standalone="${dec.standalone}"` : ``}?>`, parent));
        });

        this.saxes.on("opentag", function(tag) {
            let parent: ParentNode | undefined = stack[stack.length - 1];
            if (!parent) { 
                throw new Error("Expected element in ParentNode stack but was empty"); 
            }

            let node: TagNode = new TagNode(tag.name, tag.isSelfClosing, tag.attributes, undefined, parent);
            parent.children.push(node);
            if (!tag.isSelfClosing) {
                stack.push(node);
            }
        });

        this.saxes.on("closetag", function(tag) {
            if (stack.length !== 0 && !tag.isSelfClosing) {
                let openTag: ParentNode = stack.pop()!;
                if (openTag instanceof TagNode) {
                    openTag.children.push(new CloseTagNode(tag.name, openTag));
                }
            }
        });

        this.saxes.on("text", function(text) {
            text = text.replace(/[\n\t ]+/g, ' ');

            if (text !== "") {
                let parent: ParentNode | undefined = stack[stack.length - 1];
                if (!parent) { 
                    throw new Error("Expected element in ParentNode stack but was empty"); 
                }
                let previousNode: ASTNode | undefined = parent.children[parent.children.length - 1];

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

        this.saxes.write(doc).close();

        const propogateSpaces = this.propogateSpaces(xmlDoc);
        this.markFirstLastSpacingInTags(propogateSpaces);
        const fmtTree = this.buildFormattingTree(propogateSpaces);
        const formattedFile = this.renderNode(fmtTree, false, 0);

        return formattedFile[0];
    }

    /**
     * Recursively render a node recursively by rendering all its children
     * @param node The node to render
     * @param parentWrap Whether the node's parent was set to wrap (set false for root node)
     * @param indentLevel The indent level the current node is already at (set 0 for root node)
     * @returns [rendered string, indent level]
     */
    private renderNode(node: FMTNode, parentWrap: boolean, indentLevel: number): [string, number] {
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

    /**
     * Processes a ASTNode tree into a formatting tree
     * @param tree AST to process
     * @returns Formatting tree of type Group
     */
    private buildFormattingTree(tree: ASTNode): Group {
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
            let stackTop: Group | undefined = fmtStack[fmtStack.length - 1];
            if (!stackTop) {
                throw new Error("Expected FMTNode tree stack to be populated but was empty");
            }

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

    /**
     * Helper function to recursively mark the first and last spacing (and whether they are alone) within TagNode
     * @param node Node to process
     */
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

    /**
     * Propogate spaces across nodes such that the rendered TEI XML document will not change
     * @param tree Tree to process
     * @returns AST with spaces propogated
     */
    private propogateSpaces(tree: ASTNode): ASTNode {
        let zipper = new Zipper<ASTNode>(
            new Focus<ASTNode>(tree), 
            new Context<ASTNode>(
                new LinkedList<ASTNode>(), 
                new Top(), 
                new Top(), 
                new LinkedList<ASTNode>()
            )
        );

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

    /**
     * Function to convert a FMTNode tree into a string
     * @param node Tree to be seralized
     * @returns stringified tree
     */
    private serializeFmt(node: FMTNode): string {
        // Custom replacer to skip the parent property
        return JSON.stringify(node, (key, value) => {
            if (key === 'parent') { return undefined; } // skip circular reference
            return value;
        }, 2); // 2-space indentation for readability
    }

    /**
     * Function to convert an ASTNode tree into string
     * @param node Tree to be seralized
     * @returns stringified tree
     */
    private serializeNode(node: ASTNode): string {
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