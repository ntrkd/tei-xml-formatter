abstract class Node {
  abstract kind: string;
  
  abstract width() : number
}

export class Group extends Node {
  public kind = "Group" as const;

  constructor(public nodes: Node[]) {
    super();
  }

  width() : number {
    let width: number = 0;

    for (var n of this.nodes) {
      width += n.width();
    }

    return width;
  }
}

export class Text extends Node {
  public kind = "Text" as const;

  constructor(public readonly text: string) {
    super();
  }

  width() : number {
    return this.text.length;
  }
}

export class SpaceOrLine extends Node {
  public kind = "SpaceOrLine" as const;

  constructor() {
    super();
  }

  width() : number {
    return 1;
  }
}

export class Line extends Node {
  public kind = "Line" as const;

  constructor() {
    super();
  }

  width() : number {
    return 1;
  }
}

export class LineIndent extends Node {
  public kind = "LineIndent" as const;

  constructor() {
    super();
  }

  width() : number {
    return 1;
  }
}

export class LineDeindent extends Node {
  public kind = "LineDeindent" as const;

  constructor() {
    super();
  }

  width() : number {
    return 1;
  }
}

/*
We define these types
Group - Contains multiple nodes within it that should try to be put on the same line. It does not force the Group nodes contained within it to wrap or be on the same line.
Text - Contains text
SpaceOrLine - Rendered to a space if no wrapping needed, else a line.
Line - Insert new line and keep indent level
LineIndent - Insert new line and increase indent by 1
LineDeindent - Insert new line and decrease indent by 1
*/

/* Sample TEI XML for reference
<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Sample TEI Document</title>
        <author>Author</author>
      </titleStmt>
      <publicationStmt>
        <publisher>Practice Press</publisher>
        <pubPlace>Online</pubPlace>
        <date>2025-11-10</date>
        <availability>
          <licence target="https://creativecommons.org/licenses/by/4.0/">
            CC BY 4.0
          </licence>
        </availability>
      </publicationStmt>
      <sourceDesc>
        <p>Originally composed as a demonstration of TEI structure.</p>
      </sourceDesc>
    </fileDesc>
  </teiHeader>

  <text>
    <body>
      <p>This is a short example paragraph to practice TEI XML formatting. 
      You can add more paragraphs, line breaks, or annotations to experiment.</p>

      <p>For instance, <name type="person">Ada Lovelace</name> is often considered
      the first computer programmer.</p>
    </body>
  </text>
</TEI>
*/