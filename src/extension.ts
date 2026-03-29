import * as vscode from 'vscode';
import { TEIXMLFormatterProvider } from './formatter';

export function activate(context: vscode.ExtensionContext) {
	let formatter = new TEIXMLFormatterProvider;
	let selector: vscode.DocumentSelector = { scheme: 'file', language: 'xml' };
	const formatRegister = vscode.languages.registerDocumentFormattingEditProvider(selector, formatter);

	context.subscriptions.push(formatRegister);
}

export function deactivate() {}
