> This project is under active development and is not ready for use.

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

3. Sanitize the AST using a Zipper to allow for better traversal.

    a. A space node can be \n, \t or ' ' as long as it does not reside between two text characters / nodes.
   
    b. Spacing nodes should be carried in both directions.
   
        - Carrying means inserting another Spacing node after the next node if the node in front of it can be crossed.
        - If we are carrying left, it can cross only open tags. If we are carrying right, it can cross only close tags.
        - If the Spacing node will reside next to another Spacing node, do not insert it.
   
    c. There should now be a single Spacing node everywhere we can insert spaces into.

5. Translate the AST into a formatting tree.
   
    a. Convert all nodes normally into text. Spacing nodes require more attention.
   
    b. When we encounter a spacing node, we look backward and forward to see what type of FMT node to insert.
   
        - LineIndent - If the previous tag is an open tag and the next node is not a close tag
        - LineDeindent - If the previous tag is not an open tag and the next node is a close tag
        - SpaceOrLine - Default
   
    // TODO: A group of carried Spacing nodes should be linked together. As if all them dont need to be wrapped, only one of the Spacing nodes needs to become a space. Not all of them.

7. Generate the final XML using the formatting tree.

    a. Use width() calculations on the FMT nodes to determine whether to wrap then output the correct string literal.

## Most Recent Prototype Formatting Demonstration
The current code was quickly written to see how parts of the algorithm above would function and to spot weaknesses. The output is shown below.

### Unformatted
```xml
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="custom.xsl"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
<text><body><div type="letter">
<head>Letter from Emily to John</head><p><hi rend="italic">Dear John,</hi><lb/> I hope this letter finds you well.
The weather here has been <hi rend="bold">unusually warm</hi> for October.
</p><p>I have enclosed the sketches you asked for.
<note type="editorial">Original note: “See attached drawings.”</note></p>
<closer><salute> Yours sincerely, </salute>
<signed>Emily</signed>
</closer></div><hi> 80 808 0808 080808080808 0808008 8 8 08 08 08 80 80 80 8080 8080 8008 080 8080 8080 080 0
</hi></body></text></TEI>
```
### Formatted

More XML documents will be tested later, but for now work on getting this example to near-perfection. The main issues currently are, intersection between an open/close tag having multiple SpacingNodes pile up casuing those multi-line gaps. Indentation for open/close tags needs to be checked more thoroughly during Formatting tree generation. Current algorithm specification should fix both. However, current algorithm spec does not deal with only having one set of relating spaces render when no wrap is needed. This causes the space between every node as seen in the <closer> tag.
```xml
<TEI xmlns="http://www.tei-c.org/ns/1.0">
	<text>
		<body>
			<div type="letter">
				<head>Letter from Emily to John</head>
				<p>
					<hi rend="italic">Dear John,</hi>
					<lb/>
					I hope this letter finds you well. The weather here has been
					<hi rend="bold">unusually warm</hi>
					for October.
				</p>
				<p>
					I have enclosed the sketches you asked for.
					<note type="editorial">Original note: “See attached drawings.”</note>
				</p>
				
				
				
				<closer> <salute>Yours sincerely, </salute>  <signed>Emily</signed>  </closer>
				</div>
			
			
			
			<hi>80 808 0808 080808080808 0808008 8 8 08 08 08 80 80 80 8080 8080 8008 080 8080 8080 080 0
			</hi>
			</body>
		</text>
	</TEI>
```
