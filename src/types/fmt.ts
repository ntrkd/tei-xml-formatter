export type FMTNode = Group | Text | Line | LineIndent | LineDeindent | SpaceOrLine;
export type Wrap = 'Wrap' | 'Detect' | 'NoWrap';

interface BaseNode {
  kind: string;
  
  width() : number
}

export class Group implements BaseNode {
  public kind = "Group" as const;
  public nodes: FMTNode[];

  constructor(nodes: FMTNode[]) {
    this.nodes = nodes;
  }

  width() : number {
    let width: number = 0;

    for (var n of this.nodes) {
      width += n.width();
    }

    return width;
  }
}

export class Text implements BaseNode {
  public kind = "Text" as const;
  public readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  width() : number {
    return this.text.length;
  }
}

export class SpaceOrLine implements BaseNode {
  public kind = "SpaceOrLine" as const;

  width() : number {
    return 1;
  }
}

/**
 * Renders to a line if the parent group needs wrapping, else renders to nothing
 */
export class Line implements BaseNode {
  public kind = "Line" as const;

  width() : number {
    return 1;
  }
}

export class LineIndent implements BaseNode {
  public kind = "LineIndent" as const;

  width() : number {
    return 1;
  }
}

export class LineDeindent implements BaseNode {
  public kind = "LineDeindent" as const;

  width() : number {
    return 1;
  }
}