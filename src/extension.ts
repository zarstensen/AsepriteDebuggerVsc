// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AsepriteDebugAdapterFactory } from './AsepriteDebugSession';
import { AsepriteDebuggerConfigProvider } from './AsepriteDebuggerConfigProvider';



export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("aseprite", new AsepriteDebugAdapterFactory(context.extensionPath)));
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("aseprite", new AsepriteDebuggerConfigProvider()));

	// prompt user to select a lua file.
	context.subscriptions.push(vscode.commands.registerCommand('extension.aseprite-debugger.getScriptFile', async () => {
		return await vscode.window.showOpenDialog({
			defaultUri: vscode.Uri.file("script.lua"),
			openLabel: "select",
			canSelectMany: false,
			filters: {
				"Aseprite Script": [ "lua" ]
			},
			title: "Select script file"
		}).then(file => vscode.workspace.asRelativePath((file as vscode.Uri[])[0].fsPath));
	}));

	// prompt user to select a folder.
	context.subscriptions.push(vscode.commands.registerCommand('extension.aseprite-debugger.getExtensionFolder', () => {
		return vscode.window.showOpenDialog({
			defaultUri: vscode.Uri.file("src"),
			openLabel: "select",
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: "Select extension folder"
		}).then(folder => vscode.workspace.asRelativePath((folder as vscode.Uri[])[0].fsPath));
	}));
}

export function deactivate() {}
