// All types of visitable nodes
export type ASTNode = DocumentNode | TagNode | CloseTagNode | TextNode | SpacePossibleNode;

interface BaseNode {
    parent?: ParentNode | null;
}

export interface ParentNode {
    children: ASTNode[];
}

export class DocumentNode implements BaseNode, ParentNode {
    parent = null;
    children: ASTNode[] = [];
}

// Tags such as <p> and <hi>
export class TagNode implements BaseNode, ParentNode {
    parent: ParentNode | null;
    name: string;
    attributes: Record<string, string>;
    children: ASTNode[] = [];
    selfClosing: boolean;

    constructor(
        name: string,
        attributes: Record<string, string>,
        selfClosing: boolean,
        parent: ParentNode | null
    ) {
        this.name = name;
        this.attributes = attributes;
        this.selfClosing = selfClosing;
        this.parent = parent;
    }
}

export class CloseTagNode implements BaseNode {
    parent: ParentNode | null;
    name: string;
    
    constructor(
        name: string,
        parent: ParentNode | null
    ) {
        this.name = name;
        this.parent = parent;
    }

}

export class TextNode implements BaseNode {
    text: string;
    parent: ParentNode | null;

    constructor(
        text: string,
        parent: ParentNode | null
    ) {
        this.text = text;
        this.parent = parent;
    }
}

// Inserted only after sanitizing the AST tree
export class SpacePossibleNode implements BaseNode {
    parent: ParentNode | null;

    constructor(
        parent: ParentNode | null
    ) {
        this.parent = parent;
    }
}