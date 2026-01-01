## !Important

This project is under active development and is not ready for use.

## What is this?

This repository contains the code for a VSCode extension that formats [TEI XML](https://tei-c.org/) files to be more human readable. It uses [saxes](https://github.com/lddubeau/saxes/) currently to parse XML files and converts the nodes back into text. This formatter expects valid XML files.

## Resources Used
Yorick Peterse - [How to write a code formatter](https://yorickpeterse.com/articles/how-to-write-a-code-formatter/)

Gerard Huet - [The Zipper](https://gallium.inria.fr/~huet/PUBLIC/zip.pdf)

## Definitions and Observations

- TEI XML prefers explicit spacing. It defines no standards for how implict spaces are treated. Thus these formatting rules are specific to the renderer used in the Eartha M. M. White project. I would recommend using explicit spacing wherever possible.
- A singular space is the same as multiple spaces. One spacing node may be expanded to multiple.
- New lines and tab lines are also treated as spaces.
- Block tags are tags that make their own spacing during rendering thus ignoring the immediate spacing around them.
- Inline tags are tags that depend on spacing near them. Having no space means the rendered text might be joined together. However, having even one space between multiple inline tags that aren't interrupted by text means that all of them can have spaces and not change the final layout.
- I have yet to encouter a tag that has asymmetrical spacing requirements. So for now we disregard them.
- Ignore everything but open tags, close tags, and text nodes for now. Comments, CDATA, Processing Instruction, and XML Declaration will be implemented at a later date.

## Algorithm

1. Construct an editable AST tree from the XML file. 
    a. Combine adjacent text nodes into singular text nodes.
    b. Normalize all spaces ' ', new lines '\n', and tab lines '\t' within text to a singlar space.
    c. A text node containing a single space should be transformed into a Spacing Node. If the text node contains text, trailing and leading spaces become Spacing nodes.
        - If the Spacing node will reside next to another Spacing Node, do not insert it.

2. Sanitize the AST using a Zipper to allow for better traversal.
    a. A space node can be \n, \t or ' ' as long as it does not reside between two text characters / nodes.
    b. Spacing nodes should be carried in both directions.
        - Carrying means inserting another Spacing node after the next node if the node in front of it can be crossed.
        - If we are carrying left, it can cross only open tags. If we are carrying right, it can cross only close tags.
        - If the Spacing node will reside next to another Spacing node, do not insert it.
    c. There should now be a single Spacing node everywhere we can insert spaces into.

3. Translate the AST into a formatting tree.
    a. Convert all nodes normally into text. Spacing nodes require more attention.
    b. When we encounter a spacing node, we look backward and forward to see what type of FMT node to insert.
        - LineIndent - If the previous tag is an open tag and the next node is not a close tag
        - LineDeindent - If the previous tag is not an open tag and the next node is a close tag
        - SpaceOrLine - Default
    // TODO: A group of carried Spacing nodes should be linked together. As if all them dont need to be wrapped, only one of the Spacing nodes needs to become a space. Not all of them.

4. Generate the final XML using the formatting tree.
    a. Use width() calculations on the FMT nodes to determine whether to wrap then output the correct string literal.