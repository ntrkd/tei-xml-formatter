import * as vscode from 'vscode'; // Import VS Code API
import { Formatter } from './formatter';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let formatter = new Formatter;
	let selector: vscode.DocumentSelector = { scheme: 'file', language: 'xml' };
	const formatRegister = vscode.languages.registerDocumentFormattingEditProvider(selector, formatter);

	// // Use the console to output diagnostic information (console.log) and errors (console.error)
	// // This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "tei-xml-formatter" is now active!');

	// // The command has been defined in the package.json file
	// // Now provide the implementation of the command with registerCommand
	// // The commandId parameter must match the command field in package.json
	// const disposable = vscode.commands.registerCommand('tei-xml-formatter.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from TEI XML Formatter!');
	// });

	// context.subscriptions.push(disposable);

	context.subscriptions.push(formatRegister);
}

// This method is called when your extension is deactivated
export function deactivate() { }
