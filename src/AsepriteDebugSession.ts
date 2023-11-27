import * as vscode from 'vscode';
import { DebugSession, ExitedEvent, LoggingDebugSession, OutputEvent, StoppedEvent, TerminatedEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { ChildProcess, execFile, exec, ExecException } from 'child_process';
import * as fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';
import { promisify } from 'util';
import { Url } from 'url';
import { ProtocolServer } from '@vscode/debugadapter/lib/protocol';

/**
 * custom event type for the aseprite debugger StackTraceUpdateEvent.
 * 
 * supplies information about how the current stacktrace has changed.
 * 
 */
interface StackTraceUpdateEvent extends DebugProtocol.Event
{
    body: {
        // action to perform on current stacktrace.
        action: 'push' | 'pop' | 'update_line',
        // equal to line argument in the lua debug hook.
        line: number | undefined,
        // name of the current stack frame which was update.
        name: string | undefined,
        // source code location of the current stack frame which was updated.
        source: string | undefined,
        // number of items to pop, if action is pop
        pop_count: number | undefined,
    }
}

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

        this.on('close', async () => await this.shutdown());
        this.on('error', async err => await this.shutdown());
        process.on('SIGTERM', async () => await this.shutdown());

        this.m_show_stacktrace_cmd = vscode.commands.registerCommand('extension.aseprite-debugger.showLatestStacktrace', () => {
            this.m_lost_debug_connection = true;
            this.sendEvent(new StoppedEvent('pause', 1));
        });
    }

    dispose() {
        this.m_show_stacktrace_cmd.dispose();
        this.shutdown();
    }

    private async shutdown(): Promise<void>
    {
        this.m_ws?.close();
        this.m_ws_server?.close();
        this.m_aseprite_process?.kill();
        await Promise.all([ this.uninstallSource(), this.uninstallExtension(AsepriteDebugAdapter.ASEDEB_EXT_PATH) ]);
    }

    /**
     * forward client request to aseprite debugger.
     * if initialize request, aseprite is also started with aseprite debugger attached.
     */
    protected dispatchRequest(request: DebugProtocol.Request): void
    {
        switch(request.command)
        {
            case 'initialize':
                this.initializeRequestAsync(request)
                .catch(this.handleUncaughtException.bind(this));
            break;
            case 'disconnect':
                this.m_ws?.send(JSON.stringify(request));

                let response: DebugProtocol.DisconnectResponse = {
                    request_seq: request.seq,
                    success: true,
                    command: request.command,
                    seq: 0,
                    type: 'response'
                };
            
                this.shutdown()
                .then(() => this.sendResponse(response));
            break;
            default:
                if(!this.m_lost_debug_connection)
                {
                    this.m_ws?.send(JSON.stringify(request));
                }
                else
                {
                    this.handleRequestOnError(request);
                }
            break;
        }
    }

    /**
     * handle requests when an error has hit,
     * since debugger is then no longer able to receive requests.
     * @param request 
     */
    private handleRequestOnError(request: DebugProtocol.Request)
    {
        switch(request.command)
        {
            case 'threads':
                this.sendResponse({
                    request_seq: request.seq,
                    success: true,
                    command: request.command,
                    seq: 0,
                    type: 'response',
                    body: {
                        threads: [{
                            name: 'Main Thread',
                            id: AsepriteDebugAdapter.THREAD_ID
                        }]
                    }
                } as DebugProtocol.ThreadsResponse);
            break;
            case 'scopes':
                // since we cannot communicate with the debugger now,
                // now variables are retreivable, so return no scopes.
                this.sendResponse({
                    request_seq: request.seq,
                    success: true,
                    command: request.command,
                    seq: 0,
                    type: 'response'
                } as DebugProtocol.ScopesResponse);
            break;
            case 'stackTrace':
                // generate stacktrace, skipping any frames which has nonexistent sources,
                // as these could be f.ex. error, which then would redirects the user to an invalid file,
                // when attempting to view location of exception.

                let stacktrace_request = request as DebugProtocol.StackTraceRequest;
                
                let start_frame = stacktrace_request.arguments.startFrame ?? 0;
                let frame_count = stacktrace_request.arguments.levels ?? 1000;
                
                let stack_frames: DebugProtocol.StackFrame[] = [];
                let added_frames = 0;

                // loop over entire stacktrace,
                // to count how many valid frames it contains whilst also adding requested stackframes to response body.
                for(let i = 0; i < this.m_debugger_stacktrace.length; i++)
                {
                    let deb_stack_frame = this.m_debugger_stacktrace[this.m_debugger_stacktrace.length - i - 1];

                    if(fs.existsSync(deb_stack_frame.source))
                    {
                        if(added_frames >= start_frame && added_frames < start_frame + frame_count)
                        {
                            stack_frames.push({
                                // id does not matter, since no variables will be retreivable.
                                id: 0,
                                name: deb_stack_frame.name,
                                column: 1,
                                line: deb_stack_frame.line,
                                source: {
                                    path: deb_stack_frame.source
                                }
                            } as DebugProtocol.StackFrame);
                        }

                        added_frames++;
                    }
                }

                this.sendResponse({
                    request_seq: request.seq,
                    success: true,
                    command: request.command,
                    seq: 0,
                    type: 'response',
                    body: {
                        stackFrames: stack_frames,
                        totalFrames: added_frames
                    }
                } as DebugProtocol.StackTraceResponse);
            break;
            case 'exceptionInfo':
                this.sendResponse({
                    request_seq: request.seq,
                    success: true,
                    command: request.command,
                    seq: 0,
                    type: 'response',
                    body: {
                        exceptionId: this.m_error_message
                    }
                } as DebugProtocol.ExceptionInfoResponse);
            break;
            case 'continue':
                this.sendEvent(new TerminatedEvent());
            break;
        }
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
        
        // source is installed here already instead of in the launch request,
        // as the debugger can only run if aseprite is running, and aseprite can only load the installed source when it is started.
        await Promise.all([ this.installDebuggerExtension(), this.installSource() ]);
        
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


        this.m_aseprite_process = execFile(this.m_aseprite_exe);
        this.m_aseprite_process.stdout?.on('data', data => this.monitorAsepriteOut(data));
        this.m_aseprite_process.stderr?.on('data', data => this.logProcessOut(data, "ASEOUT", 'stderr'));

        await connection_received;

        // proceed with initialize request

        this.m_ws?.send(JSON.stringify(args));
    }

    // custom name of aseprite debugger extension, if suffixed with an '!' to make sure it is loaded as the first extension.
    // this does assume no other extensions will start with an '!', possible solution is to make the number of '!' configurable.
    private static readonly ASEDEB_EXT_PATH: string = "!AsepriteDebugger";
    private static readonly THREAD_ID = 1;

    private m_session: vscode.DebugSession;
    
    private m_ext_path: string;
    private m_user_config_path: string | undefined;
    // folder name the debugged extension was installed under, only used of projectTye = 'extension. 
    private m_source_ext_name: string | undefined;

    private m_aseprite_exe: string;
    private m_aseprite_process: ChildProcess | undefined;
    
    private m_ws_server: WebSocketServer | undefined;
    private m_ws: WebSocket | undefined;

    // current stacktrace, according to all received StackTraceUpdateEvents received from debugger.
    private m_debugger_stacktrace: { source: string, line: number, name: string }[] = [];
    private m_lost_debug_connection: boolean = false;
    private m_error_message: string | undefined;

    private m_show_stacktrace_cmd: vscode.Disposable;

    /**
     * forwards a message received from the debugger to the current debugger client.
     * @param data message
     */
    private forwardDebuggerMessage(data: string): void
    {
        let message = JSON.parse(data.toString());

        switch((message as DebugProtocol.ProtocolMessage).type)
        {
            case 'event':
                if((message as DebugProtocol.Event).event === "stackTraceUpdate")
                {
                    let stacktrace_event: StackTraceUpdateEvent = message;

                    switch(stacktrace_event.body.action)
                    {
                        case 'push':
                            this.m_debugger_stacktrace.push({
                                source: stacktrace_event.body.source as string,
                                line: stacktrace_event.body.line as number,
                                name: stacktrace_event.body.name as string,
                                });
                        break;
                        case 'update_line':
                            if(this.m_debugger_stacktrace.length <= 0)
                            {
                                break;
                            }
                            
                            this.m_debugger_stacktrace[this.m_debugger_stacktrace.length - 1].line = stacktrace_event.body.line as number;
                        break;
                        case 'pop':
                            for(let i: number = 0; i < (stacktrace_event.body.pop_count ?? 0); i++)
                            {
                                this.m_debugger_stacktrace.pop();
                            }
                        break;
                    }
                }
                else
                {
                    this.sendEvent(message as DebugProtocol.Event);
                }
            break;
            case 'response':
                this.sendResponse(message as DebugProtocol.Response);
            break;
        }
    }
    
    /**
     * installs the aseprite projects source as a script or an extension, depending on the launch configuration
     * @param user_config_path path to install extensions to
     */
    private async installSource()
    {
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
                let src_path = path.join(root, this.m_session.configuration.source);
                // retreive extension name.

                if(!fs.existsSync(path.join(src_path, "package.json")))
                {
                    throw Error("Invalid extension, missing package.json!");
                }

                let pckg = JSON.parse((await promisify(fs.readFile)(path.join(src_path, "package.json"))).toString());
                this.m_source_ext_name = pckg.name;

                await promisify<string | URL, string | URL, fs.CopyOptions>(fs.cp)(src_path, `${this.m_user_config_path}/extensions/${this.m_source_ext_name}`, { recursive: true });
            break;
        }
    }

    private async installDebuggerExtension()
    {
        let ext_path = `${this.m_user_config_path}/extensions/${AsepriteDebugAdapter.ASEDEB_EXT_PATH}`;

        // copy extension files and dependencies.
        await promisify<string | URL, string | URL, fs.CopyOptions>(fs.cp)(`${this.m_ext_path}/out/debugger`, ext_path, { recursive: true });
        await promisify<string | URL, string | URL, fs.CopyOptions>(fs.cp)(`${this.m_ext_path}/out/bin/${vscode.workspace.getConfiguration('aseprite-debugger').get('asepriteArch')}`,
            ext_path, { recursive: true });

        // create the config.json file.

        let folders = vscode.workspace.workspaceFolders;

        let root = "";

        if(folders?.length! > 0)
        {
            root = folders![0].uri.fsPath;
        }

        let install_dir = "";

        switch(this.m_session.configuration.projectType)
        {
            case 'script':
                install_dir = `${this.m_user_config_path}/scripts/${path.basename(this.m_session.configuration.source)}`;
            break;
            case 'extension':
                install_dir = `${this.m_user_config_path}/extensions/${this.m_source_ext_name}`;
            break;
        }

        let src_dir = path.join(root, this.m_session.configuration.source);

        let config = {
            endpoint: `ws://localhost:${this.m_session.configuration.wsPort}/${this.m_session.configuration.wsPath}`,
            source_dir: src_dir,
            install_dir: install_dir
        };

        await promisify(fs.writeFile)(`${ext_path}/config.json`, JSON.stringify(config));
    }

    /**
     * uninstalls the aseprite extension with the given name from aseprite
     * @param ext_name 
     */
    private async uninstallExtension(ext_name: string)
    {
        await promisify(fs.rm)(`${this.m_user_config_path}/extensions/${ext_name}`, { recursive: true });
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
            case 'extension':
                await this.uninstallExtension(this.m_source_ext_name as string);
            break;
        }
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
     * check if an error message exists in the passed aseprite stdout line.
     * if an error message is detected, and it is from a source file in the current vscode workspace,
     * an exception stop event is sent.
     * 
     * @param data stdout of aseprite program
     */
    private checkForError(data: string)
    {
        let err_match = data.match(/(.*):\d*:(.*)/);

        if(!err_match)
        {
            return;
        }
        
        let file = path.normalize(err_match[1]);
        let message = err_match[2];

        let folders = vscode.workspace.workspaceFolders;

        let root = "";

        if(folders?.length! > 0)
        {
            root = folders![0].uri.fsPath;
        }


        // check if error message originated from a source file that is currently being debugged.
        switch(this.m_session.configuration.projectType)
        {
            case 'script': 
                let script_file_match = file.match(new RegExp(`^${path.normalize(`${this.m_user_config_path}/scripts/(.*)`).replaceAll('\\', '\\\\').replaceAll('/', '\\/')}$`));

                if(!script_file_match)
                {
                    return;
                }

                if(!fs.existsSync(path.join(root, path.dirname(this.m_session.configuration.source), script_file_match[1])))
                {
                    return;
                }
                
            break;
            case 'extension':
                let norm_path = path.normalize(`${this.m_user_config_path}/extensions/${this.m_source_ext_name}/.*`).replaceAll('\\', '\\\\').replaceAll('/', '\\/');
                let extension_folder_match = file.match(new RegExp(`^${norm_path}$`));

                if(!extension_folder_match)
                {
                    return;
                }
            break;
        }

        // report error.
        
        this.m_lost_debug_connection = true;
        this.m_error_message = message;
        this.sendEvent({
            event: 'stopped',
            body: {
                reason: 'exception',
                allThreadsStopped: true,
                threadId: 1
            }
        } as DebugProtocol.Event);
    }

    /**
     * Monitor output of aseprite for errors, whilst forwarding all output to client.
     * @param data 
     */
    private monitorAsepriteOut(data: string)
    {
        this.checkForError(data);
        this.logProcessOut(data, "ASEOUT", 'stdout');
    }

    

    /**
     * Log process output to debug console, with a set suffix, so user can filter the messages away.
     * @param data program output.
     * @param suffix suffix to prepend every line in program output.
     * @param category output event category to use.
     */
    private logProcessOut(data: string, suffix: string, category: string): void
    {
        let msg = "";

        let data_lines: string[] = data.toString().split(/\r?\n/);

        data_lines.forEach((line, i, arr) => msg += `${suffix}: ${line}\n`);

        this.sendEvent(new OutputEvent(msg, category));
    }
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