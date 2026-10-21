import assert from 'node:assert/strict';
import test from 'node:test';

import { Formatter, FormatterError, FormatterErrorCode } from '../dist/esm/index.js';

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
