> This project is under active development, expect ~~breaking~~ massive changes!

## About

This is a TypeScript library that formats [TEI XML](https://tei-c.org/) files. It uses [saxes](https://github.com/lddubeau/saxes/) to parse XML, format, and then output a formatted string. This formatter expects valid XML files.

## Demonstrations

### Unformatted
```xml
<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
<teiHeader> <fileDesc>
      <titleStmt> <title>Letter from Emily Hart to John Reed</title> </titleStmt>
  <sourceDesc> <p>Original manuscript, private collection.</p>
</sourceDesc> </fileDesc> </teiHeader>
<text>
    <body> <div type="letter">
<opener> <dateline>Bath, <date when="1862-10-14">14 October 1862</date></dateline>
        <salute>My dear John,</salute> </opener>
  <p>
The sketches are enclosed &#8212; the harbour,
the mill &amp; the church at <placeName>Wells</placeName>.     I hope they
           arrive <choice><sic>safly</sic><corr>safely</corr></choice> before the end of the month.
</p>
<!-- signature is in a different ink -->
      <closer> <salute>Yours ever,</salute> <signed>Emily</signed> </closer>
</div> </body>
  </text>
</TEI>
```

### Formatted
```xml
<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
	<teiHeader>
		<fileDesc>
			<titleStmt> <title>Letter from Emily Hart to John Reed</title> </titleStmt>
			<sourceDesc> <p>Original manuscript, private collection.</p> </sourceDesc>
		</fileDesc>
	</teiHeader>
	<text>
		<body>
			<div type="letter">
				<opener>
					<dateline>Bath, <date when="1862-10-14">14 October 1862</date></dateline>
					<salute>My dear John,</salute>
				</opener>
				<p>
					The sketches are enclosed &#8212; the harbour, the mill &amp; the church at
					<placeName>Wells</placeName>. I hope they arrive
					<choice><sic>safly</sic><corr>safely</corr></choice>
					before the end of the month.
				</p>
				<!-- signature is in a different ink -->
				<closer> <salute>Yours ever,</salute> <signed>Emily</signed> </closer>
			</div>
		</body>
	</text>
</TEI>
```

## Importing and Usage
The package is published on [npmjs](www.npmjs.com/package/tei-xml-fmt). We publish CJS and [ESM](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import) versions to allow either type of project to import.

```js
// ESM import
import { Formatter } from "tei-xml-fmt";
```

```js
// CJS require() import
const { Formatter } = require('tei-xml-fmt');
```

```js
// Make a new instance
const texfmt = new Formatter();

let unformattedXML = '<p> Hello World! Tags that are sufficiently long will be wrapped automatically. </p>';

// The format function takes in a single string with the text to format.
// It returns a string with the formatted text.
let formattedText = texfmt.format(unformattedXML);

console.log(formattedText);
```

## Algorithm

### TL;DR
First uses saxes to parse the .xml file into code which can be processed easier than raw text. First we construct a tree called an Abstract Syntax Tree (AST). This contains enough information to distinguish between Tag Nodes, Close Tag Nodes, Text, and Spaces. Then we take that, process it a bit more and lower it into a Formatting Tree which strips out even more information down to just Groups (contain Text and Space nodes), Text, and SpaceOrLine nodes. From here there is very little information to process and most of the formatting has been done. We render the Formatting Tree into raw text again.

### Steps

1. Construct an editable AST tree from the XML file.

    a. Combine adjacent text nodes into singular text nodes.
   
    b. Normalize all spaces ' ', new lines '\n', and tab lines '\t' within text to a singlar space.
   
    c. A text node containing a single space should be transformed into a Spacing Node. If the text node contains text, trailing and leading spaces become Spacing nodes.
   
	- If the Spacing node will reside next to another Spacing Node, do not insert it.

3. Sanitize the AST using a Zipper to allow for better traversal.

    a. A space node can be \n, \t or ' ' as long as it does not reside between two text characters / nodes.
   
    b. Spacing nodes should be carried in both directions.
   
	- Carrying means inserting another Spacing node after the next node if the node in front of it can be crossed.
	- If we are carrying left, it can cross only open tags. If we are carrying right, it can cross only close tags.
	- Self-closing tags are never crossed. They mark a position in the text (like `<lb/>`), so a space carried before one would change the text.
	- If the Spacing node will reside next to another Spacing node, do not insert it.
   
    c. There should now be a single Spacing node everywhere we can insert spaces into.

5. Translate the AST into a formatting tree.
   
    a. Convert all nodes normally into text. Spacing nodes require more attention.
   
    b. Every spacing node becomes a SpaceOrLine. We look forward to mark the ones that come right before a close tag.
   
    // TODO: A group of carried Spacing nodes should be linked together. As if all them dont need to be wrapped, only one of the Spacing nodes needs to become a space. Not all of them.

7. Generate the final XML using the formatting tree.

    a. A group wraps when the column it starts at plus its width() is over 80. Each tab counts as one column.

    b. Indentation follows nesting. In a wrapping group, a SpaceOrLine becomes a new line one level deeper than the line the group started on. A SpaceOrLine right before the close tag goes back to that line's level. The document itself does not indent.

## Definitions and Observations

- TEI XML prefers explicit spacing. It defines no standards for how implict spaces are treated. Thus these formatting rules are specific to the renderer used in the Eartha M. M. White project. I would recommend using explicit spacing wherever possible.
- A singular space is the same as multiple spaces. One spacing node may be expanded to multiple.
- New lines and tab lines are also treated as spaces.
- Block tags are tags that make their own spacing during rendering thus ignoring the immediate spacing around them.
- Inline tags are tags that depend on spacing near them. Having no space means the rendered text might be joined together. However, having even one space between multiple inline tags that aren't interrupted by text means that all of them can have spaces and not change the final layout.
- I have yet to encouter a tag that has asymmetrical spacing requirements. So for now we disregard them.
- Ignore everything but open tags, close tags, text nodes, comments, processing instructions, and the XML declaration for now. CDATA and doctype will be implemented at a later date. Comments are kept verbatim and are treated like text when deciding spacing.

## Credits

Yorick Peterse - [How to write a code formatter](https://yorickpeterse.com/articles/how-to-write-a-code-formatter/)

Gerard Huet - [The Zipper](https://gallium.inria.fr/~huet/PUBLIC/zip.pdf)

TEI Council - [TEI Specification](https://tei-c.org/release/doc/tei-p5-doc/en/html/index.html)
