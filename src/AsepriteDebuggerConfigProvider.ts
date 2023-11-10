import * as vscode from 'vscode';

/**
 * Configuration provider for aseprite debugger.
 */
export class AsepriteDebuggerConfigProvider implements vscode.DebugConfigurationProvider
{
    /**
     * Prompts user to choose the type of the configuration, (is it a script or an extension),
     * and then afterwards prompted to choose the source file or folder depending on previous step.
     * @returns script, extension or no configuration depending on user actions.
     */
    provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.DebugConfiguration[]> {
        return this.promptProjType()
        .then(type => {
            return this.configFromTypeAndPrompt(type as string)
            .then(c =>{
                if(c !== undefined)
                {
                    return [c];
                }
                else
                {
                    return [];
                }
            });
        });
    }

    /**
     * Returns a script configuration for the current file if script is selected by the user, otherwise the standard extension prompt is used.
     */
    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.DebugConfiguration> {
        
        if(config.type || config.request || config.name)
        {
            return config;
        }
        
        let get_proj_type: Promise<string | undefined> = Promise.resolve("script");
        
        if(folder)
        {
            get_proj_type = get_proj_type
            .then(_ => this.promptProjType()); 
        }

        return get_proj_type
        .then(type => {
            switch(type)
            {
                case 'script':
                    return this.createConfig("Aseprite Script", "script", "${file}");
                case 'extension':
                    return this.configFromTypeAndPrompt(type);
            }
        });
    }

    /**
     * Prompt user to select the aseprite project type
     */
    private promptProjType(): Thenable<string | undefined>
    {
        return vscode.window.showQuickPick([ "script", "extension" ], {
            title: "Aseprite Script Type",
            matchOnDescription: true,
            canPickMany: false
        });
    }

    /**
     * Create an aseprite debugger configuration from the given name, project type and source path.
     * @param name name of DebugConfiguration
     * @param type project type, either script or extension.
     * @param source path to script or extension folder.
     */
    private createConfig(name: string, type: string, source: string): vscode.DebugConfiguration
    {
        return {
            type: "aseprite",
            name: name,
            projectType: type,
            source: source,
            stopOnEntry: false,
            wsPort: vscode.workspace.getConfiguration('aseprite-debugger').get('defaultWsPort') as number,
            wsPath: vscode.workspace.getConfiguration('aseprite-debugger').get('defaultWsPath') as string,
            request: "launch"
        };
    }

    /**
     * Same as createConfig, except source is retreived by executing the pick_source_command.
     * @param pick_source_command command string passed to executeCommand.
     * @returns 
     */
    private createConfigPrompt(name: string, type: string, pick_source_command: string): Thenable<vscode.DebugConfiguration>
    {
        return vscode.commands.executeCommand(pick_source_command)
        .then(source => this.createConfig(name, type, source as string));
    }

    /**
     * Create an aseprite debugger configuration from the given type, as well as a user prompt used for selecting the source path.
     * @param type script or extension
     */
    private configFromTypeAndPrompt(type: string | undefined): Thenable<vscode.DebugConfiguration | undefined>
    {
        switch(type)
        {
        case "script":
            return this.createConfigPrompt("Aseprite Script", "script", "extension.aseprite-debugger.getScriptFile");
        case "extension":
            return this.createConfigPrompt("Aseprite Extension", "extension", "extension.aseprite-debugger.getExtensionFolder");
        }
        
        return Promise.resolve(undefined);
    }
}
