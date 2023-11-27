// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { AsepriteDebugAdapterFactory } from './AsepriteDebugSession';
import { AsepriteDebuggerConfigProvider } from './AsepriteDebuggerConfigProvider';
import path = require('path');



export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory("aseprite", new AsepriteDebugAdapterFactory(context.extensionPath)));
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("aseprite", new AsepriteDebuggerConfigProvider()));

	// prompt user to select a lua file.
	context.subscriptions.push(vscode.commands.registerCommand('extension.aseprite-debugger.getScriptFile', async () => {
		
		let script_file = "script.lua";

		let folders = vscode.workspace.workspaceFolders;

		if(folders)
		{
			script_file = path.join(folders[0].uri.fsPath, script_file);
		}

		return await vscode.window.showOpenDialog({
			defaultUri: vscode.Uri.file(script_file),
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
		
		let script_folder = "src";

		let folders = vscode.workspace.workspaceFolders;

		if(folders)
		{
			script_folder = path.join(folders[0].uri.fsPath, script_folder);
		}

		return vscode.window.showOpenDialog({
			defaultUri: vscode.Uri.file(script_folder),
			openLabel: "select",
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: "Select extension folder"
		}).then(folder => vscode.workspace.asRelativePath((folder as vscode.Uri[])[0].fsPath));
	}));
}

export function deactivate() {}
