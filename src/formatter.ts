import { SaxesParser } from 'saxes';
import { DocumentNode, TagNode, TextNode, CommentNode, ProcessingInstructionNode, CloseTagNode, SpacingNode, isParentNode } from './ast.js';
import type { ParentNode, ASTNode } from './ast.js';
import { Group, Text, SpaceOrLine } from './fmt.js';
import type { FMTNode } from "./fmt.js";
import * as zip from './zipper.js';
import type {
	Zipper,
	ZipperAdapter,
} from './zipper.js';

export enum FormatterErrorCode {
    ParserError = 'ParserError',
    ParentStackEmpty = 'ParentStackEmpty',
    FmtStackEmpty = 'FmtStackEmpty',
    ZipperGoTopFailed = 'ZipperGoTopFailed',
    UnexpectedZipperState = 'UnexpectedZipperState',
    PlaceholdersExhausted = 'PlaceholdersExhausted',
}

// Predefined entity and character references, the only references saxes decodes without a DTD
const REFERENCE_PATTERN = /&(?:#x([0-9A-Fa-f]+)|#([0-9]+)|amp|lt|gt|quot|apos);/g;
// References are swapped for characters from the Private Use Area while parsing
const PLACEHOLDER_FIRST = 0xE000;
const PLACEHOLDER_LAST = 0xF8FF;
const PLACEHOLDER_PATTERN = /[-]/g;

export class FormatterError extends Error {
    public readonly code: FormatterErrorCode;
    public declare readonly cause?: Error;

    constructor(code: FormatterErrorCode, message: string, cause?: Error) {
        super(message, { cause });
        this.name = 'FormatterError';
        this.code = code;
    }
}

export type FormatterErrorType = FormatterErrorCode;

export class Formatter {
    private saxes: SaxesParser;
    // Placeholder character -> the reference it replaced, as written in the source
    private references = new Map<string, string>();

    constructor() {
        this.saxes = new SaxesParser();
    }

    /**
     * Swap every reference saxes would decode for a placeholder character, so the reference is
     * passed through the parser untouched and can be written out exactly as it was in the source
     * @param doc Document to process
     * @returns The document with references swapped for placeholders
     */
    private swapReferences(doc: string): string {
        this.references = new Map();
        const placeholders = new Map<string, string>(); // reference -> placeholder
        // Placeholders must not collide with characters already in the document
        const used = new Set(doc.match(PLACEHOLDER_PATTERN));
        let next = PLACEHOLDER_FIRST;

        return doc.replace(REFERENCE_PATTERN, (reference, hex: string | undefined, decimal: string | undefined) => {
            // Leave invalid character references for saxes to report
            if (hex !== undefined || decimal !== undefined) {
                const codePoint = hex !== undefined ? parseInt(hex, 16) : parseInt(decimal ?? '', 10);
                if (!this.isXmlChar(codePoint)) {
                    return reference;
                }
            }

            const existing = placeholders.get(reference);
            if (existing !== undefined) {
                return existing;
            }

            while (used.has(String.fromCodePoint(next))) {
                next++;
            }
            this.assert(next <= PLACEHOLDER_LAST, FormatterErrorCode.PlaceholdersExhausted, "Ran out of placeholder characters for references");

            const placeholder = String.fromCodePoint(next++);
            placeholders.set(reference, placeholder);
            this.references.set(placeholder, reference);
            return placeholder;
        });
    }

    /**
     * Swap placeholders back for the references they replaced
     * @param text Text containing placeholders
     * @returns Text with the original references
     */
    private restoreReferences(text: string): string {
        return text.replace(PLACEHOLDER_PATTERN, (char) => this.references.get(char) ?? char);
    }

    /**
     * Whether a code point matches the Char production of the XML spec
     * @param codePoint Code point to check
     */
    private isXmlChar(codePoint: number): boolean {
        return codePoint === 0x9 || codePoint === 0xA || codePoint === 0xD
            || (codePoint >= 0x20 && codePoint <= 0xD7FF)
            || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
            || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
    }

    private assert(condition: boolean, code: FormatterErrorCode, message: string): asserts condition {
        if (!condition) {
            throw new FormatterError(code, message);
        }
    }

    /**
     * Make a Zipper from a tree node
     * @param tree Tree to construct Zipper around
     * @returns Traversable Zipper object
     */
    private makeZipper(tree: ASTNode): Zipper<ASTNode> {
        // Adapter function allows the Zipper which is generic to do actions which are specific to the ASTNode types
        const adapter: ZipperAdapter<ASTNode> = {
            isLeaf: (node): node is ASTNode => !isParentNode(node), // no child means leaf
            getChildren: (node): ASTNode[] => (isParentNode(node) ? node.children : []),
            /**
             * Function to make a new node from a node and children variable
             * @param node Node to attach children to
             * @param children Children to attach
             * @returns An ASTNode node with the children attached
             */
            makeNode: (node, children): ASTNode => {
                if (isParentNode(node)) {
                    node.children = children;
                    node.attachChildren();
                }
                return node;
            },
        };

        return {
            focus: tree,
            context: { kind: zip.ContextVariant.ROOT },
            adapter,
        };
    }

    public format(doc: string): string {
        // lets restart from 1 so each new format doesnt result in crazy long id counts
        SpacingNode.uniqueIDCount = 1;
        // const he = require('he');

        const xmlDoc: DocumentNode = new DocumentNode();
        const stack: ParentNode[] = [ xmlDoc ];

        this.saxes.on("error", (e) => {
            throw new FormatterError(FormatterErrorCode.ParserError, 'SAX parser error', e);
        });

        this.saxes.on("processinginstruction", (pi) => {
            const parent: ParentNode | undefined = stack[stack.length - 1];
            this.assert(!!parent, FormatterErrorCode.ParentStackEmpty, "Expected element in ParentNode stack but was empty");

            const body = this.restoreReferences(pi.body);
            // Kept as is, the body is not whitespace collapsed
            parent.children.push(new ProcessingInstructionNode(`<?${pi.target}${body !== "" ? ` ${body}` : ``}?>`, parent));
        });

        this.saxes.on("comment", (comment) => {
            const parent: ParentNode | undefined = stack[stack.length - 1];
            this.assert(!!parent, FormatterErrorCode.ParentStackEmpty, "Expected element in ParentNode stack but was empty");

            // Kept as is, the comment body is not whitespace collapsed
            parent.children.push(new CommentNode(this.restoreReferences(comment), parent));
        });

        this.saxes.on("xmldecl", dec => { // Always the first line in the XML document
            const parent: ParentNode | undefined = stack[stack.length - 1];
            this.assert(!!parent, FormatterErrorCode.ParentStackEmpty, "Expected element in ParentNode stack but was empty");

            const encoding = dec.encoding !== undefined ? ` encoding="${dec.encoding}"` : ``;
            const standalone = dec.standalone !== undefined ? ` standalone="${dec.standalone}"` : ``;
            parent.children.push(new ProcessingInstructionNode(`<?xml version="${dec.version}"${encoding}${standalone}?>`, parent));
        });

        this.saxes.on("opentag", (tag) => {
            const parent: ParentNode | undefined = stack[stack.length - 1];
            this.assert(!!parent, FormatterErrorCode.ParentStackEmpty, "Expected element in ParentNode stack but was empty");

            // Values are stored as they will be written. Attributes are always written in double quotes,
            // so a literal " (only possible in a single quoted value) has to be escaped
            const attributes = Object.fromEntries(Object.entries(tag.attributes).map(
                ([name, value]) => [name, this.restoreReferences(value.replaceAll('"', '&quot;'))],
            ));
            const node: TagNode = new TagNode(tag.name, tag.isSelfClosing, attributes, undefined, parent);
            parent.children.push(node);
            if (!tag.isSelfClosing) {
                stack.push(node);
            }
        });

        this.saxes.on("closetag", (tag) => {
            if (stack.length !== 0 && !tag.isSelfClosing) {
                const openTag: ParentNode | undefined = stack.pop();
                this.assert(!!openTag, FormatterErrorCode.ParentStackEmpty, "Expected element in ParentNode stack but was empty");
                if (openTag instanceof TagNode) {
                    openTag.children.push(new CloseTagNode(tag.name, openTag));
                }
            }
        });

        this.saxes.on("text", (text) => {
            // References are restored first so whitespace written as a character reference is not collapsed
            text = this.restoreReferences(text).replace(/[\n\t ]+/g, ' ');

            if (text !== "") {
                const parent: ParentNode | undefined = stack[stack.length - 1];
                this.assert(!!parent, FormatterErrorCode.ParentStackEmpty, "Expected element in ParentNode stack but was empty");
                const previousNode: ASTNode | undefined = parent.children[parent.children.length - 1];

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
                    const spaceAtFirst = text.charAt(0) === " ";
                    const spaceAtLast = text.charAt(text.length - 1) === " ";
                    const textNode = new TextNode(text, parent); // Reference to edit obj later

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

        this.saxes.write(this.swapReferences(doc)).close();

        const propogateSpaces = this.propogateSpaces(xmlDoc);
        // Whitespace outside the root element and spaces carried past it are direct children of the DocumentNode
        this.trimLeadingSpacing(propogateSpaces);
        this.trimTrailingSpacing(propogateSpaces);
        const fmtTree = this.buildFormattingTree(propogateSpaces);
        const formattedFile = this.renderNode(fmtTree, 0);

        return formattedFile[0];
    }

    /**
     * Recursively render a node by rendering all its children
     * @param node The node to render
     * @param indentLevel Indent level of the line the node starts on (set 0 for root node)
     * @returns [rendered string, indent level of the line the node ends on]
     */
    private renderNode(node: FMTNode, indentLevel: number): [string, number] {
        const MAX_WDITH = 80;
        const INDENT_UNIT = '\t';
        const NEWLINE = '\n';

        if (node instanceof Text) {
            return [node.text, indentLevel];
        }
        // Lines are rendered by the group containing them, which knows whether it wraps
        if (node instanceof SpaceOrLine) {
            return [' ', indentLevel];
        }

        // A group that fits never has a child that wraps, children are never wider than their parent
        const wrap = node.width() > MAX_WDITH;
        // Indentation follows nesting: lines go one level deeper than the line the group starts on,
        // and the line before the close tag goes back to it
        const groupIndent = indentLevel;
        const childIndent = node.indent ? groupIndent + 1 : groupIndent;
        let output = '';

        for (const child of node.nodes) {
            if (child instanceof SpaceOrLine && wrap) {
                indentLevel = child.beforeClose ? groupIndent : childIndent;
                output += NEWLINE + INDENT_UNIT.repeat(indentLevel);
            } else {
                const [text, endIndentLevel] = this.renderNode(child, indentLevel);
                output += text;
                indentLevel = endIndentLevel;
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
        let zipper = this.makeZipper(tree);

        // The document itself does not indent its children
        const fmtTree: Group = new Group([], false);
        const fmtStack: Group[] = [ fmtTree ];

        // setup a loop to go until the end (!success)
        while (true) {
            // do logic
            const stackTop: Group | undefined = fmtStack[fmtStack.length - 1];
            this.assert(!!stackTop, FormatterErrorCode.FmtStackEmpty, "Expected FMTNode tree stack to be populated but was empty");

            // decide what type the current focus is
            const focus: ASTNode = zipper.focus;

            if (focus instanceof DocumentNode) {
                // this node renders to nothing
            } else if (focus instanceof TagNode) {
                // needs a new group attached, stack increased, and tag node textualized and added to the new group
                const attrStr = Object.entries(focus.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
                const tagText = `<${focus.name}${attrStr}${focus.selfClosing ? ' /' : ''}>`;
                const newGroup = new Group([new Text(tagText)]);
                stackTop.nodes.push(newGroup);
                if (!focus.selfClosing) {
                    fmtStack.push(newGroup);
                }
            } else if (focus instanceof CloseTagNode) {
                // textualized and added to most recent group, then pop the stack
                const closeText = `</${focus.name}>`;
                stackTop.nodes.push(new Text(closeText));
                fmtStack.pop();
            } else if (focus instanceof TextNode) {
                // just add as a text node
                stackTop.nodes.push(new Text(focus.text));
            } else if (focus instanceof CommentNode) {
                // rendered verbatim like text
                stackTop.nodes.push(new Text(`<!--${focus.text}-->`));
            } else if (focus instanceof ProcessingInstructionNode) {
                // already holds the whole instruction, rendered as is like text
                stackTop.nodes.push(new Text(focus.text));
            } else if (focus instanceof SpacingNode) {
                // handled per 5b. in the algorithm spec
                const nextNode = zip.peekNext(zipper);
                stackTop.nodes.push(new SpaceOrLine(nextNode.success && nextNode.item instanceof CloseTagNode));
            }


            const next = zip.goNext(zipper);

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
     * Remove SpacingNodes that come before any content in the document
     * (e.g. whitespace before the root element, or a space propogated past the root open tag)
     * @param node Node to process (the DocumentNode)
     */
    private trimLeadingSpacing(node: ASTNode): void {
        if (!isParentNode(node)) {
            return;
        }

        // A TagNode renders its own open tag before its children, so only the top level can have leading spaces
        while (node.children[0] instanceof SpacingNode) {
            node.children.shift();
        }
    }

    /**
     * Remove SpacingNodes that come after all content in the document
     * (e.g. a trailing newline after the root element, or a space propogated past the root close tag)
     * @param node Node to process (the DocumentNode)
     */
    private trimTrailingSpacing(node: ASTNode): void {
        if (!isParentNode(node)) {
            return;
        }

        // A TagNode always ends with its CloseTagNode, so only the top level can have trailing spaces
        while (node.children[node.children.length - 1] instanceof SpacingNode) {
            node.children.pop();
        }
    }

    /**
     * Propogate spaces across nodes such that the rendered TEI XML document will not change
     * @param tree Tree to process
     * @returns AST with spaces propogated
     */
    private propogateSpaces(tree: ASTNode): ASTNode {
        let current = this.makeZipper(tree);
        // We only break once we hit the end of the document
        while (true) {
            const currentNode = current.focus;
            if (currentNode instanceof SpacingNode) {
                // Avoid infinite propogation by only propogating spaces that have not been propogated before
                if (!currentNode.propogateLeft) {
                    let leftPropogation: Zipper<ASTNode> = current;
                    // Break manually when we hit a node we cannot carry over
                    while (true) {
                        const tryPrev = zip.goPrevious(leftPropogation);
                        if (tryPrev.success) {
                            leftPropogation = tryPrev.zipper;
                        } else {
                            // We have reached the beginning, mark as propogated so we don't revisit this forever
                            currentNode.propogateLeft = true;
                            break;
                        }

                        // Self-closing tags (<lb/>, <pb/>, ...) mark a position in the text, a space carried before one changes the text
                        if (leftPropogation.focus instanceof TagNode && !leftPropogation.focus.selfClosing) {
                            // if no space node to left, insert space node then goPrevious

                            const peekPrev = zip.peekPrevious(leftPropogation);
                            // previous node must not be SpacingNode
                            if (peekPrev.success && !(peekPrev.item instanceof SpacingNode) || !peekPrev.success) {
                                const spaceLeftInsert = zip.insertLeft(leftPropogation, new SpacingNode(leftPropogation.focus.parent, true, true));
                                if (!spaceLeftInsert.success) {
                                    console.warn("Tried to insert a space at the root node");
                                    break;
                                }

                                const oneNodeBack = zip.goPrevious(spaceLeftInsert.zipper);
                                if (!oneNodeBack.success) {
                                    console.warn("Impossible state");
                                    break;
                                }

                                leftPropogation = oneNodeBack.zipper;
                            } else {
                                currentNode.propogateLeft = true;
                                break; // Cannot carry space so break
                            }
                        } else {
                            currentNode.propogateLeft = true;
                            break;
                        }
                    }

                    current = leftPropogation;
                } else if (!currentNode.propogateRight) {
                    let rightPropogation: Zipper<ASTNode> = current;
                    // break manually when we hit a node we cannot carry over
                    while (true) {
                        const tryNext = zip.goNext(rightPropogation);
                        if (tryNext.success) {
                            rightPropogation = tryNext.zipper;
                        } else {
                            // We have reached the end, mark as propogated so we don't revisit this forever
                            currentNode.propogateRight = true;
                            break;
                        }

                        if (rightPropogation.focus instanceof CloseTagNode) {
                            // if no space node to right of the closed TagNode, insert space node after it then goRight
                            // The CloseTagNode is the last child of its TagNode, so the space must be inserted on the TagNode itself
                            const parentTag = zip.goUp(rightPropogation);
                            if (!parentTag.success) {
                                console.warn("CloseTagNode has no parent TagNode");
                                break;
                            }

                            const nextSibling = zip.goRight(parentTag.zipper);
                            // next node must not be SpacingNode
                            if (nextSibling.success && !(nextSibling.zipper.focus instanceof SpacingNode) || !nextSibling.success) {
                                const spaceRightInsert = zip.insertRight(parentTag.zipper, new SpacingNode(parentTag.zipper.focus.parent, true, true));
                                if (!spaceRightInsert.success) {
                                    console.warn("Tried to insert a space at the root node");
                                    break;
                                }

                                const oneNodeForward = zip.goRight(spaceRightInsert.zipper);
                                if (!oneNodeForward.success) {
                                    console.warn("Impossible state");
                                    break;
                                }

                                rightPropogation = oneNodeForward.zipper;
                            } else {
                                currentNode.propogateRight = true;
                                break; // Cannot carry space so break
                            }
                        } else {
                            currentNode.propogateRight = true;
                            break;
                        }
                    }

                    current = rightPropogation;
                } else {
                    const goNext = zip.goNext(current);
                    if (goNext.success) {
                        current = goNext.zipper;
                    } else {
                        // We reached the end
                        break;
                    }
                }
            } else {
                const goNext = zip.goNext(current);
                if (goNext.success) {
                    current = goNext.zipper;
                } else {
                    // We reached the end
                    break;
                }
            }
        }

        // Go top
        const tryTop = zip.goTop(current);
        if (!tryTop.success) {
            console.warn("An unexpected state occured when trying to go to the top of the Zipper");
            return tree;
        }
        
        return tryTop.zipper.focus;
    }

    /**
     * Function to convert a FMTNode tree into a string
     * @param node Tree to be seralized
     * @returns stringified tree
     */
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: debug helper
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
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: debug helper
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
                        const result: { _type: string; children?: unknown; [propName: string]: unknown } = { _type: ctor.name };

                        // copy over properties except children first
                        for (const [propName, propValue] of Object.entries(value)) {
                            if (propName === 'parent' || propName === 'children') {
                                continue;
                            }
                            result[propName] = propValue;
                        }

                        // append children at end if present
                        if ('children' in value) {
                            result.children = value.children;
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