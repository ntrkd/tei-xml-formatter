export type FMTNode = Group | Text | SpaceOrLine;
export type Wrap = 'Wrap' | 'Detect' | 'NoWrap';

interface BaseFMTNode {
  kind: string;
  
  width() : number
}

export class Group implements BaseFMTNode {
  public kind = "Group" as const;
  public nodes: FMTNode[];
  // Whether lines inside the group are indented one level deeper than the line the group starts on
  public indent: boolean;

  constructor(nodes: FMTNode[], indent = true) {
    this.nodes = nodes;
    this.indent = indent;
  }

  width() : number {
    let width = 0;

    for (var n of this.nodes) {
      width += n.width();
    }

    return width;
  }
}

export class Text implements BaseFMTNode {
  public kind = "Text" as const;
  public readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  width() : number {
    return this.text.length;
  }
}

/**
 * Renders to a new line if the parent group needs wrapping, else renders to a space
 */
export class SpaceOrLine implements BaseFMTNode {
  public kind = "SpaceOrLine" as const;
  // Whether the line comes right before the close tag of its group, which goes back to the group's indent
  public beforeClose: boolean;

  constructor(beforeClose = false) {
    this.beforeClose = beforeClose;
  }

  width() : number {
    return 1;
  }
}