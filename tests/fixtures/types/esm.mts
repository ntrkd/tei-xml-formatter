import { Formatter, FormatterError, FormatterErrorCode } from 'tei-xml-fmt';

const formatted: string = new Formatter().format('<TEI />');
const error: FormatterError | undefined = undefined;
const code: FormatterErrorCode | undefined = undefined;

// @ts-expect-error format() only accepts a string, so this fails if the types resolve to `any`.
new Formatter().format(42);

export { code, error, formatted };
