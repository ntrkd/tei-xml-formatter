// Rewrite v2.0 of AST node types.
// Requirements, all nodes must be editable at any point.

// One type for AST Nodes - Includes Parent Nodes. All nodes must have the parent field except for DocumentNode.
export type ASTNode = DocumentNode
    | TagNode
    | CloseTagNode
    | TextNode
    | SpacingNode;

export interface BaseNode {
    parent: ParentNode | null;
}

// ParentNode interface
export interface ParentNode extends BaseNode {
    parent: ParentNode | null;
    children: ASTNode[];

    /**
     * Ensure every child node has the parent set to this instance
     */
    attachChildren(): void;
}

export abstract class BaseParentNode implements ParentNode {
    parent: ParentNode | null = null;
    children: ASTNode[] = [];

    attachChildren() {
        for (const child of this.children) {
            child.parent = this;
        }
    }
}

export function isParentNode(node: BaseNode): node is ParentNode {
    return Array.isArray((node as any).children);
}

// A DocumentNode - A Parent Node. Must be the root of the tree.
export class DocumentNode extends BaseParentNode {
    kind = 'Document' as const;

    constructor(
        children: ASTNode[] = []
    ) {
        super();

        this.parent = null;
        this.children = children;
        this.attachChildren();
    }
}

// Tag Node - A Parent Node. Contains a Close Tag Node as its last child unless selfClose = true
export class TagNode extends BaseParentNode {
    kind = 'Tag' as const;
    name: string;
    selfClosing: boolean;
    attributes: Record<string, string>;

    constructor(
        name: string,
        selfClosing: boolean,
        attributes: Record<string, string>,
        children: ASTNode[] = [],
        parent: ParentNode | null = null
    ) {
        super();

        this.name = name;
        this.selfClosing = selfClosing;
        this.attributes = attributes;
        this.parent = parent;
        this.children = children;
    }
}

// Close Tag Node - Only inserted on non-self closing tags. Always the last child.
export class CloseTagNode implements BaseNode {
    kind = 'CloseTag' as const;
    name: string;
    parent: ParentNode | null;

    constructor(
        name: string,
        parent: ParentNode | null = null
    ) {
        this.name = name;
        this.parent = parent;
    }
}

// Text Node - Contains a single field of type string which is editable after initialization.
export class TextNode implements BaseNode {
    kind = 'Text' as const;
    text: string;
    parent: ParentNode | null;

    constructor(
        text: string,
        parent: ParentNode | null = null
    ) {
        this.text = text;
        this.parent = parent;
    }
}

// Spacing Node - A placeholder for where spaces can be inserted.
export class SpacingNode implements BaseNode {
    kind = 'Spacing' as const;
    parent: ParentNode | null;

    constructor(
        parent: ParentNode | null = null
    ) {
        this.parent = parent;
    }
}