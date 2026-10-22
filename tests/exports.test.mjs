import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

// Import the package by its own name so resolution goes through the "exports" map
// in package.json, exactly as it would for a consumer.
import * as esm from 'tei-xml-fmt';

const require = createRequire(import.meta.url);
const cjs = require('tei-xml-fmt');

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtures = join(root, 'tests', 'fixtures', 'types');
const esmTypes = join(root, 'dist', 'esm', 'index.d.ts');
const cjsTypes = join(root, 'dist', 'cjs', 'index.d.ts');

const sample = '<TEI><text><body><p>Hello <hi>world</hi><lb/>again</p></body></text></TEI>';

test('import resolves to the ESM build', () => {
	assert.equal(fileURLToPath(import.meta.resolve('tei-xml-fmt')), join(root, 'dist', 'esm', 'index.js'));
});

test('require resolves to the CJS build', () => {
	assert.equal(require.resolve('tei-xml-fmt'), join(root, 'dist', 'cjs', 'index.js'));
});

for (const [name, mod] of [
	['ESM', esm],
	['CJS', cjs],
]) {
	test(`${name} build exposes the public API`, () => {
		assert.equal(typeof mod.Formatter, 'function');
		assert.equal(typeof mod.FormatterError, 'function');
		assert.equal(typeof mod.FormatterErrorCode, 'object');
	});

	test(`${name} build formats a document`, () => {
		assert.equal(
			new mod.Formatter().format(sample),
			'<TEI><text><body><p>Hello <hi>world</hi><lb />again</p></body></text></TEI>',
		);
	});

	test(`${name} build throws FormatterError on invalid XML`, () => {
		assert.throws(() => new mod.Formatter().format('<TEI>'), mod.FormatterError);
	});
}

/**
 * Type-checks a consumer fixture and returns its diagnostics and the package
 * declaration files the compiler loaded.
 */
function typeCheck(fixture, options) {
	const program = ts.createProgram([join(fixtures, fixture)], {
		strict: true,
		noEmit: true,
		types: [],
		target: ts.ScriptTarget.ESNext,
		...options,
	});
	const diagnostics = ts
		.getPreEmitDiagnostics(program)
		.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
	const loaded = program.getSourceFiles().map((f) => f.fileName.split('/').join(sep));

	return { diagnostics, loaded };
}

for (const [label, fixture, options, expected, unexpected] of [
	[
		'nodenext import',
		'esm.mts',
		{ module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
		esmTypes,
		cjsTypes,
	],
	[
		'nodenext require',
		'cjs.cts',
		{ module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
		cjsTypes,
		esmTypes,
	],
	[
		'bundler import',
		'esm.mts',
		{ module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
		esmTypes,
		cjsTypes,
	],
	// node10 ignores "exports" (so it can't self-reference the package) and only
	// reads the top-level "types" field, so point the name at the package directory.
	[
		'node10 require',
		'cjs.cts',
		{
			module: ts.ModuleKind.CommonJS,
			moduleResolution: ts.ModuleResolutionKind.Node10,
			ignoreDeprecations: '6.0',
			paths: { 'tei-xml-fmt': [resolve(root)] },
		},
		cjsTypes,
		esmTypes,
	],
]) {
	test(`types resolve for ${label}`, () => {
		const { diagnostics, loaded } = typeCheck(fixture, options);

		assert.deepEqual(diagnostics, []);
		assert.ok(loaded.includes(expected), `expected ${expected} to be loaded`);
		assert.ok(!loaded.includes(unexpected), `expected ${unexpected} not to be loaded`);
	});
}
