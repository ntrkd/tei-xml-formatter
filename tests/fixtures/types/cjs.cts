import fmt = require('tei-xml-fmt');

const formatted: string = new fmt.Formatter().format('<TEI />');
const error: fmt.FormatterError | undefined = undefined;
const code: fmt.FormatterErrorCode | undefined = undefined;

// @ts-expect-error format() only accepts a string, so this fails if the types resolve to `any`.
new fmt.Formatter().format(42);

export = { code, error, formatted };
