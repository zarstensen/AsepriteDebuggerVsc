import * as vscode from 'vscode';
import { ExitedEvent, LoggingDebugSession, StoppedEvent, TerminatedEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ChildProcess, execFile, exec, ExecException } from 'child_process';
import * as fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';
import { promisify } from 'util';
import { Url } from 'url';
import { ProtocolServer } from '@vscode/debugadapter/lib/protocol';

/**
 * aseprite debug adapter session, for installing, uninstalling and communicating with the aseprite debugger extension.
 * its primary purpose is to simply pipe client and aseprite debugger messages to each other, however some special requests and responses require extra functionality,
 * for starting and stopping aseprite with the aseprite debugger attached. 
 */
class AsepriteDebugAdapter extends ProtocolServer
{
    /**
     * @param ext_path path to vscode extension source.
     */
    public constructor(session: vscode.DebugSession, ext_path: string)
    {
        super();
        this.m_session = session;
        this.m_ext_path = ext_path;
        this.m_aseprite_exe = vscode.workspace.getConfiguration('aseprite-debugger').get('asepriteExe')!;
        
        this.on('close', () => this.shutdown());
        this.on('error', err => this.shutdown());
    }

    shutdown(): void
    {
        this.m_aseprite_process?.kill();
        this.uninstallSource();
        this.uninstallExtension(AsepriteDebugAdapter.ASEDEB_EXT_PATH);
    }

    /**
     * forward client request to aseprite debugger.
     * if initialize request, aseprite is also started with aseprite debugger attached.
     */
    protected dispatchRequest(request: DebugProtocol.Request): void
    {
        if(request.command === 'initialize')
        {
            this.initializeRequestAsync(request)
            .catch(this.handleUncaughtException);
            return;
        }
        
        this.m_ws?.send(JSON.stringify(request));
    }

    /**
     * run aseprite with the aseprite debugger extension isntalled, and connect the debugger to the current debug adapters websocket server,
     * after this, go through a normal initialize request.
     * @param args 
     */
    protected async initializeRequestAsync(args: DebugProtocol.Request)
    {
        this.m_user_config_path = await this.getUserConfigPath();
        
        if(!this.m_user_config_path)
        {
            throw Error("Could not retreive aseprite user config path!");
        }
        
        await this.installDebuggerExtension();
        
        // run websocket server.
        
        this.m_ws_server = new WebSocketServer({
            port: this.m_session.configuration.wsPort,
            path: `/${this.m_session.configuration.wsPath}`
        });
        
        let connection_received = new Promise<void>(resolve => {
            // accept debugger connection.
            this.m_ws_server!.once('connection',
            ws => {
                this.m_ws = ws;
                this.m_ws.on('message', data => this.forwardDebuggerMessage(data.toString()));
                
                resolve();
            });
        });

        // source is installed here already instead of in the launch request,
        // as the debugger can only run if aseprite is running, and aseprite can only load the installed source when it is started.

        this.installSource();

        this.m_aseprite_process = execFile(this.m_aseprite_exe);
        
        await connection_received;

        // proceed with initialize request

        this.m_ws?.send(JSON.stringify(args));
    }

    /**
     * forwards a message received from the debugger to the current debugger client.
     * @param data message
     */
    private forwardDebuggerMessage(data: string): void {
        let message = JSON.parse(data.toString());

        switch((message as DebugProtocol.ProtocolMessage).type)
        {
            case 'event':
                this.sendEvent(message as DebugProtocol.Event);
            break;
            case 'response':
                let response = message as DebugProtocol.Response;

                this.sendResponse(response);
                
                if(response.command === 'disconnect')
                {
                    this.shutdown();
                }
            break;
        }
    }
    
    /**
     * installs the aseprite projects source as a script or an extension, depending on the launch configuration
     * @param user_config_path path to install extensions to
     */
    private async installSource() {
        let folders = vscode.workspace.workspaceFolders;
        
        let root = "";

        if(folders?.length! > 0)
        {
            root = folders![0].uri.fsPath;
        }

        switch(this.m_session.configuration.projectType)
        {
            case 'script':
                await promisify(fs.copyFile)(path.join(root, this.m_session.configuration.source), `${this.m_user_config_path}/scripts/${path.basename(this.m_session.configuration.source)}`);
                break;
            case 'extension':
                let src_path = path.join(root, this.m_session.configuration.source)
                // retreive extension name.

                if(!fs.existsSync(path.join(src_path, "package.json")))
                {
                    throw Error("Invalid extension, missing package.json!");
                }

                let pckg = JSON.parse(await promisify(fs.readFile)(path.join(src_path, "package.json")).toString());
                this.m_source_ext_name = pckg.name;

                await promisify(fs.cp)(src_path, `${this.m_user_config_path}/extensions/${this.m_source_ext_name}`);
                break;
        }
    }

    private async installDebuggerExtension() {

        let ext_path = `${this.m_user_config_path}/extensions/${this.m_user_config_path}`;

        // copy extension files and dependencies.
        await promisify<string | URL, string | URL, fs.CopyOptions>(fs.cp)(`${this.m_ext_path}/out/debugger`, ext_path, { recursive: true });
        await promisify<string | URL, string | URL, fs.CopyOptions>(fs.cp)(`${this.m_ext_path}/out/bin`, ext_path, { recursive: true });

        // create the config.json file.
        let config = {
            endpoint: `ws://localhost:${this.m_session.configuration.wsPort}/${this.m_session.configuration.wsPath}`,
        };
        
        await promisify(fs.writeFile)(`${ext_path}/config.json`, JSON.stringify(config));
    }

    /**
     * uninstalls the aseprite extension with the given name from aseprite
     * @param ext_name 
     */
    private async uninstallExtension(ext_name: string)
    {
        await promisify(fs.rmdir)(`${this.m_user_config_path}/extensions/${ext_name}`, { recursive: true });
    }

    /**
     * removes the previously installed source from aseprite, so it wont be loaded when aseprite is started again.
     */
    private async uninstallSource()
    {
        switch(this.m_session.configuration.projectType)
        {
            case 'script':
                await promisify(fs.unlink)(`${this.m_user_config_path}/scripts/${path.basename(this.m_session.configuration.source)}`);
            break;
            case 'extenison':
                await this.uninstallExtension(this.m_source_ext_name as string);
            break;
        }
    }

    /**
     * Show user uncaught exception, and stop debugging.
     * TODO: capture aseprite output, and also put it here.
     * @param ex 
     */
    private handleUncaughtException(ex: any): void
    {
        vscode.window.showErrorMessage(`${ex.toString()}\n${ex.stdout ? `stdout: ${ex.stdout}` : '' }`);
        // add aseprite output here
        this.sendEvent(new TerminatedEvent());
        this.sendEvent(new ExitedEvent(this.m_aseprite_process?.exitCode ?? -1 ));
    }

    /**
     * retreives the user config path of aseprite, where extensions and scripts are installed.
     */
    private async getUserConfigPath(): Promise<string | undefined>
    {
        let result = await promisify(exec)(`${this.m_aseprite_exe} -b --script "./assets/getUserConfigPath.lua"`, {
            cwd: this.m_ext_path
        });
        
        let user_config_path = this.parseUserConfigPath(result.stdout);
        
        if(user_config_path === undefined)
        {
            throw new Error(`Could not get userConfigPath from aseprite output.\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
        }

        return user_config_path;
    }

    /**
     * parse the user config path printed from the getUserConfigPath.lua script, from aseprites standard output.
     * @param stdout program output of aseprite which has run the getUserConfigPath.lua script.
     * @returns aseprites user config path, or undefined if aseprite output was invalid (missing the user config path).
     */
    private parseUserConfigPath(stdout: string): string | undefined
    {
        // getUserConfigPath prints the path to output, surrounded with !<USER_CONFIG_PATH><USER_CONFIG_PATH>
        let splits = stdout.split("!<USER_CONFIG_PATH>");

        if(splits.length < 2)
        {
            return undefined;
        }

        splits = splits[1].split("<USER_CONFIG_PATH>");

        if(splits.length < 2)
        {
            return undefined;
        }

        return splits[0];
    }

    // custom name of aseprite debugger extension, if suffixed with an '!' to make sure it is loaded as the first extension.
    // this does assume no other extensions will start with an '!', possible solution is to make the number of '!' configurable.
    private static readonly ASEDEB_EXT_PATH: string = "!AsepriteDebugger";

    private m_session: vscode.DebugSession;
    
    private m_ext_path: string;
    private m_user_config_path: string | undefined;
    // folder name the debugged extension was installed under, only used of projectTye = 'extension. 
    private m_source_ext_name: string | undefined;

    private m_aseprite_exe: string;
    private m_aseprite_process: ChildProcess | undefined;
    
    private m_ws_server: WebSocketServer | undefined;
    private m_ws: WebSocket | undefined;
}

/**
 * Creates an inline implementation AsepriteDebugAdapter.
 * extension path is needed for installing the source to aseprite.
 */
export class AsepriteDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory
{
    
    public constructor(ext_path: string)
    {
        this.m_ext_path = ext_path;
    }

	createDebugAdapterDescriptor(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor>
	{
        this.m_debug_adapter = new AsepriteDebugAdapter(session, this.m_ext_path);
		return new vscode.DebugAdapterInlineImplementation(this.m_debug_adapter);
	}
    
	dispose(): void
	{
        this.m_debug_adapter?.dispose();
		this.m_debug_adapter = undefined;
	}
    
    private m_debug_adapter: AsepriteDebugAdapter | undefined;
    private m_ext_path: string;
}