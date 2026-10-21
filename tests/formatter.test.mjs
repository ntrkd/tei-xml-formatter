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

test('keeps the parser error as the cause of a ParserError', () => {
	assert.throws(
		() => new Formatter().format('<p a="1"b="2"></p>'),
		(error) => error instanceof FormatterError
			&& error.cause instanceof Error
			&& error.cause.message.includes('no whitespace between attributes'),
	);
});

test('keeps the cause passed to the FormatterError constructor', () => {
	const cause = new Error('inner');

	assert.equal(new FormatterError(FormatterErrorCode.ParserError, 'outer', cause).cause, cause);
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

// xml entity handling tests
test('keeps entity and character references in text as written', () => {
	const cases = [
		'<p>a &lt;choice&gt; &amp; b</p>',
		'<p>x &#8212; y &#x2013; &#0162; &#34;q&#34; &apos;</p>',
		'<p>a]]&gt;b</p>',
	];

	for (const xml of cases) {
		assert.equal(new Formatter().format(xml), xml);
	}
});

test('keeps references in attribute values as written', () => {
	const formatted = new Formatter().format('<p n="a&amp;b &quot;c&quot; &lt; &#8212;">t</p>');

	assert.equal(formatted, '<p n="a&amp;b &quot;c&quot; &lt; &#8212;">t</p>');
});

test('escapes double quotes from single quoted attribute values', () => {
	const formatted = new Formatter().format(`<p n='say "hi" &amp; bye'>t</p>`);

	assert.equal(formatted, '<p n="say &quot;hi&quot; &amp; bye">t</p>');
});

test('does not collapse whitespace written as a character reference', () => {
	const formatted = new Formatter().format('<p n="l1&#10;l2">x&#10;y &#9; z</p>');

	assert.equal(formatted, '<p n="l1&#10;l2">x&#10;y &#9; z</p>');
});

test('keeps references in comments and processing instructions as is', () => {
	const formatted = new Formatter().format('<?pi a &amp; b?><p>a<!-- &lt;b&gt; &#8212; --></p>');

	assert.equal(formatted, '<?pi a &amp; b?><p>a<!-- &lt;b&gt; &#8212; --></p>');
});

test('keeps private use characters already in the document', () => {
	const formatted = new Formatter().format('<p> &amp;  &lt;</p>');

	assert.equal(formatted, '<p> &amp;  &lt;</p>');
});

test('formatting output with references again does not change it', () => {
	const formatter = new Formatter();
	const once = formatter.format(`<TEI><p n='a "b"'>x &lt;y&gt; &#8212; z</p></TEI>`);

	assert.equal(formatter.format(once), once);
});

test('throws ParserError for undefined entities and invalid character references', () => {
	for (const xml of ['<p>&nbsp;</p>', '<p>&#0;</p>', '<p>&#xD800;</p>']) {
		assert.throws(
			() => new Formatter().format(xml),
			(error) => error instanceof FormatterError && error.code === FormatterErrorCode.ParserError,
		);
	}
});
// xml entity handling tests

// processing instruction handling tests
test('keeps whitespace inside processing instructions followed by whitespace', () => {
	const formatted = new Formatter().format('<?xml-model href="a.rng"   type="application/xml"?>\n<TEI/>');

	assert.equal(formatted, '<?xml-model href="a.rng"   type="application/xml"?> <TEI />');
});

// saxes does not report the whitespace between the target and the body, so it is always written as one space
test('keeps multi-line processing instruction bodies verbatim', () => {
	const formatted = new Formatter().format('<?xml version="1.0"?>\n<?pi  a\n\tb?>\n<TEI/>');

	assert.equal(formatted, '<?xml version="1.0"?> <?pi a\n\tb?> <TEI />');
});

test('does not merge text into a processing instruction inside an element', () => {
	const cases = [
		{ xml: '<p>x<?pi   a    b?>  y</p>', expected: '<p>x<?pi a    b?> y</p>' },
		{ xml: '<p>x<?pi   a    b?>y</p>', expected: '<p>x<?pi a    b?>y</p>' },
	];

	for (const { xml, expected } of cases) {
		assert.equal(new Formatter().format(xml), expected);
	}
});
// processing instruction handling tests

// structural indentation tests
test('indents content by nesting depth when a tag only has a space after its open tag', () => {
	const words = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
	const formatted = new Formatter().format(`<root><r> ${words}</r></root>`);

	assert.equal(formatted, `<root>\n\t<r>\n\t\t${words}</r></root>`);
});

test('puts a close tag level with the line its tag opened on when only it has a space before it', () => {
	const words = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
	const formatted = new Formatter().format(`<root><r>${words} </r></root>`);

	assert.equal(formatted, `<root><r>${words}\n</r>\n</root>`);
});

test('indents children of a tag that shares a line with its parent', () => {
	const words = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
	const formatted = new Formatter().format(
		`<TEI><text><body>\n<div><p>${words}</p>\n<p>${words} fifteen</p></div>\n</body></text></TEI>`,
	);

	assert.equal(
		formatted,
		`<TEI>\n\t<text>\n\t\t<body>\n\t\t\t<div><p>${words}</p>\n\t\t\t\t<p>${words} fifteen</p></div>\n\t\t</body>\n\t</text>\n</TEI>`,
	);
});
// structural indentation tests

// self-closing tag spacing tests
test('does not carry a space before a self-closing tag', () => {
	const cases = [
		{ xml: '<p>Episco<lb break="no"/>\npal and Jackson-<lb/>\nville</p>', expected: '<p>Episco<lb break="no" /> pal and Jackson-<lb /> ville</p>' },
		{ xml: '<p><lb/> text</p>', expected: '<p><lb /> text</p>' },
		{ xml: '<p>a<pb n="2"/><lb/> b</p>', expected: '<p>a<pb n="2" /><lb /> b</p>' },
		{ xml: '<div><p>x</p><milestone unit="section"/> <p>y</p></div>', expected: '<div><p>x</p><milestone unit="section" /> <p>y</p></div>' },
	];

	for (const { xml, expected } of cases) {
		assert.equal(new Formatter().format(xml), expected);
	}
});

test('keeps spaces around self-closing tags that were in the source', () => {
	for (const xml of ['<p>a <lb/> b</p>', '<p>word <lb/>next</p>']) {
		assert.equal(new Formatter().format(xml), xml.replace('<lb/>', '<lb />'));
	}
});

test('keeps self-closing tags at the end of their line when wrapping', () => {
	const formatted = new Formatter().format(
		'<div>\n<p>Executive committee<lb/>\n<name>S. H. Berg</name>, President<lb/>\n<name>Louie Limbaugh</name>, Vice President<lb/>\nMrs. E. G. McFadden, Secretary</p>\n</div>',
	);

	assert.equal(
		formatted,
		'<div>\n\t<p>Executive committee<lb />\n\t\t<name>S. H. Berg</name>, President<lb />\n\t\t<name>Louie Limbaugh</name>, Vice President<lb />\n\t\tMrs. E. G. McFadden, Secretary</p>\n</div>',
	);
});
// self-closing tag spacing tests

// wrapping tests
test('wraps a group that only exceeds the width because of its indentation', () => {
	// <d> is 78 characters wide and starts after 3 tabs
	const formatted = new Formatter().format(
		'<a> <b> <c> <d> Letter to the committee about the new orphanage on Pearl Street, 1921 </d> </c> </b> </a>',
	);

	assert.equal(
		formatted,
		'<a>\n\t<b>\n\t\t<c>\n\t\t\t<d>\n\t\t\t\tLetter to the committee about the new orphanage on Pearl Street, 1921\n\t\t\t</d>\n\t\t</c>\n\t</b>\n</a>',
	);
});
// wrapping tests
