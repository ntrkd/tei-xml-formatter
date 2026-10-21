import assert from 'node:assert/strict';
import test from 'node:test';

import { Formatter, FormatterError, FormatterErrorCode } from '../dist/esm/index.js';
import { Group, Line, LineDeindent, LineIndent, SpaceOrLine, Text } from '../dist/esm/fmt.js';

test('formats simple inline XML without changing text content', () => {
	const formatted = new Formatter().format('<p>Hello <hi>world</hi></p>');

	assert.equal(formatted, '<p>Hello <hi>world</hi></p>');
});

test('normalizes self-closing tags emitted by the parser', () => {
	const formatted = new Formatter().format('<TEI><text><body><p>Hello<lb/>world</p></body></text></TEI>');

	assert.equal(formatted, '<TEI><text><body><p>Hello<lb />world</p></body></text></TEI>');
});

test('preserves XML declarations and processing instructions', () => {
	const formatted = new Formatter().format(
		'<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="custom.xsl"?><TEI />',
	);

	assert.equal(
		formatted,
		'<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="custom.xsl"?><TEI />',
	);
});

test('collapses whitespace runs inside text nodes', () => {
	const formatted = new Formatter().format('<p>Hello\n\t   world</p>');

	assert.equal(formatted, '<p>Hello world</p>');
});

test('throws FormatterError with parser code for invalid XML', () => {
	assert.throws(
		() => new Formatter().format('<p>broken'),
		(error) => error instanceof FormatterError && error.code === FormatterErrorCode.ParserError,
	);
});

// tests for https://github.com/ntrkd/tei-xml-formatter/issues/9
test('returns and drops trailing whitespace after the root element', () => {
	for (const trailing of ['\n', ' ', '\r\n', '\n\n\t ']) {
		const formatted = new Formatter().format(`<TEI><p>x</p></TEI>${trailing}`);

		assert.equal(formatted, '<TEI><p>x</p></TEI>');
	}
});

test('does not propogate a space past the root close tag', () => {
	const formatted = new Formatter().format('<TEI><p>x</p> </TEI>\n');

	assert.equal(formatted, '<TEI><p>x</p> </TEI>');
});

test('keeps the space between the XML declaration and the root element', () => {
	const formatted = new Formatter().format('<?xml version="1.0"?>\n<TEI><p>x</p></TEI>\n');

	assert.equal(formatted, '<?xml version="1.0"?> <TEI><p>x</p></TEI>');
});

test('trailing whitespace does not change the formatting of a wrapped document', () => {
	const doc = '<?xml version="1.0" encoding="UTF-8"?>\n<TEI xmlns="http://www.tei-c.org/ns/1.0">\n<text><body><div type="letter">\n<head>Letter from Emily to John</head> <p> <hi rend="italic">Dear John,</hi><lb/> I hope this letter finds you well.\nThe weather here has been <hi rend="bold">unusually warm</hi> for October.\n</p></div></body></text></TEI>';
	const expected = new Formatter().format(doc);

	assert.match(expected, /\n\t<text>/);
	for (const trailing of ['\n', '\r\n']) {
		assert.equal(new Formatter().format(doc + trailing), expected);
	}
});
// tests for https://github.com/ntrkd/tei-xml-formatter/issues/9

// tests for https://github.com/ntrkd/tei-xml-formatter/issues/8
test('keeps sibling indentation after a wrapped tag ending in a space', () => {
	const long = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor';
	const formatted = new Formatter().format(`<TEI>\n<div>\n<p>a</p>\n<p>${long} </p><p>b</p>\n</div>\n</TEI>`);

	assert.equal(
		formatted,
		`<TEI>\n\t<div>\n\t\t<p>a</p>\n\t\t<p>${long}\n\t\t</p>\n\t\t<p>b</p>\n\t</div>\n</TEI>`,
	);
});
// tests for https://github.com/ntrkd/tei-xml-formatter/issues/8

test('preserves comments without adding or removing surrounding spaces', () => {
	assert.equal(new Formatter().format('<p>a<!--x-->b</p>'), '<p>a<!--x-->b</p>');
	assert.equal(new Formatter().format('<p>a <!-- x --> b</p>'), '<p>a <!-- x --> b</p>');
	assert.equal(new Formatter().format('<TEI><!--a--><!--b--></TEI>'), '<TEI><!--a--><!--b--></TEI>');
	assert.equal(new Formatter().format('<p><!---->x</p>'), '<p><!---->x</p>');
});

test('preserves comments outside the root element', () => {
	const formatted = new Formatter().format('<?xml version="1.0"?>\n<!-- top -->\n<TEI><p>x</p></TEI>\n<!-- end -->\n');

	assert.equal(formatted, '<?xml version="1.0"?> <!-- top --> <TEI><p>x</p></TEI> <!-- end -->');
});

test('keeps multi-line comment bodies verbatim', () => {
	const formatted = new Formatter().format('<TEI><p>x</p><!--\n  multi\n  line\n--></TEI>');

	assert.equal(formatted, '<TEI><p>x</p><!--\n  multi\n  line\n--></TEI>');
});

test('indents comments as the first and last children of a wrapped tag', () => {
	const long = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor';
	const formatted = new Formatter().format(`<TEI>\n<!-- first -->\n<p>${long}</p>\n<!-- last -->\n</TEI>`);

	assert.equal(formatted, `<TEI>\n\t<!-- first -->\n\t<p>${long}</p>\n\t<!-- last -->\n</TEI>`);
});

test('throws NegativeIndent when spacing would deindent below level 0', () => {
	const long = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor';
	const lastSpaceOrLine = new SpaceOrLine();
	lastSpaceOrLine.significance = 'Last';
	const lastLine = new Line();
	lastLine.significance = 'Last';

	for (const space of [lastSpaceOrLine, lastLine, new LineDeindent()]) {
		const tree = new Group([new Text(`<p>${long}`), space, new Text('</p>')]);

		assert.throws(
			() => new Formatter()['renderNode'](tree, false, 0),
			(error) => error instanceof FormatterError && error.code === FormatterErrorCode.NegativeIndent,
		);
	}
});

test('throws UnbalancedIndent when a group does not end at the indent level it started at', () => {
	const long = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor';
	const cases = [
		// indent with no matching deindent
		{ space: new LineIndent(), indentLevel: 0 },
		// deindent with no matching indent, nested deep enough that it never goes below 0
		{ space: new LineDeindent(), indentLevel: 2 },
	];

	for (const { space, indentLevel } of cases) {
		const tree = new Group([new Text(`<p>${long}`), space, new Text('</p>')]);

		assert.throws(
			() => new Formatter()['renderNode'](tree, false, indentLevel),
			(error) => error instanceof FormatterError && error.code === FormatterErrorCode.UnbalancedIndent,
		);
	}
});
