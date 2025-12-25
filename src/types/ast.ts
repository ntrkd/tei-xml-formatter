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
    parent: ParentNode;
    name: string;
    attributes: Record<string, string>;
    children: ASTNode[] = [];
    selfClosing: boolean;

    constructor(
        name: string,
        attributes: Record<string, string>,
        selfClosing: boolean,
        parent: ParentNode
    ) {
        this.name = name;
        this.attributes = attributes;
        this.selfClosing = selfClosing;
        this.parent = parent;
    }
}

export class CloseTagNode implements BaseNode {
    parent: ParentNode;
    name: string;
    
    constructor(
        name: string,
        parent: ParentNode
    ) {
        this.name = name;
        this.parent = parent;
    }

}

export class TextNode implements BaseNode {
    text: string;
    parent: ParentNode;

    constructor(
        text: string,
        parent: ParentNode
    ) {
        this.text = text;
        this.parent = parent;
    }
}