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
