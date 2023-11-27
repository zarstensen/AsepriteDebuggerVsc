<div align="center">
  <h1 align="center">Aseprite Debugger for Visual Studio Code</h1>
  <img src=https://github.com/zarstensen/AsepriteDebugger/blob/main/assets/AsepriteDebuggerIcon.png?raw=true alt="Icon" width="200" height="200"/>
</div>

[![build](https://img.shields.io/github/actions/workflow/status/zarstensen/AsepriteDebugger/tests.yml?label=tests
)](https://github.com/zarstensen/AsepriteDebugger/actions/workflows/tests.yml) [![marketplace](https://img.shields.io/visual-studio-marketplace/v/zarstensen.aseprite-debugger?label=visual%20studio%20marketplace)](https://marketplace.visualstudio.com/items?itemName=zarstensen.aseprite-debugger)

Aseprite Debugger is an Visual Studio Code extension, which enables debugging of [Aseprite](https://www.aseprite.org/) scripts and extensions.

- [Features](#features)
  - [Breakpoints](#breakpoints)
  - [Variable Inspection](#variable-inspection)
  - [Logging](#logging)
  - [Error Detection](#error-detection)
  - [Script And Extension Support](#script-and-extension-support)
- [Setup Extension](#setup-extension)
  - [Install Extension](#install-extension)
  - [Install Lua Language Support](#install-lua-language-support)
  - [Specify Aseprite Location](#specify-aseprite-location)
  - [Specify Executable Architecture (optional)](#specify-executable-architecture-optional)
- [Setup VSCode Workspace for Debugging](#setup-vscode-workspace-for-debugging)
- [Commands](#commands)
- [Limitations](#limitations)
  - [Editing Source Files Whilst Debugging](#editing-source-files-whilst-debugging)
  - [Aseprite Control](#aseprite-control)
  - [Extension Name](#extension-name)
  - [Lua Globals](#lua-globals)
  - [Non Error Errors](#non-error-errors)
- [Built With](#built-with)
- [Links](#links)
- [License](#license)

## Features

### Breakpoints

Set breakpoints, step through code and view stack trace.

![Breakpoints Example](https://github.com/zarstensen/AsepriteDebuggerVSC/blob/main/assets/Breakpoints.gif?raw=true)

### Variable Inspection

Inspect values of variables, including Aseprite objects.

![Variables Example](https://github.com/zarstensen/AsepriteDebuggerVSC/blob/main/assets/Variables.gif?raw=true)

### Logging

View logs in VSCode Debug Console, instead of the Aseprite Console window.

![Logging Example](https://github.com/zarstensen/AsepriteDebuggerVSC/blob/main/assets/Logging.gif?raw=true)

### Error Detection

Detect lua errors, and provide a full stacktrace of the problematic code.

![Errors Example](https://github.com/zarstensen/AsepriteDebuggerVSC/blob/main/assets/Errors.gif?raw=true)

### Script And Extension Support

Debug either scripts or extensions.

![Project Types Example](https://github.com/zarstensen/AsepriteDebuggerVSC/blob/main/assets/ProjectTypes.gif?raw=true)

## Setup Extension

the Aseprite Debugger extension require some setup after an initial install, please perform the below steps to ensure it will work properly.

### Install Extension

The extension can be installed either via. the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zarstensen.aseprite-debugger), or by directly installing the .vsix file from the [latest release](https://github.com/zarstensen/AsepriteDebugger/releases/latest), using the 'Extensions: Install From VSIX...' command.

### Install Lua Language Support

This extension requires an vscode extension to provide language support for lua, like [Lua by sumneko](https://marketplace.visualstudio.com/items?itemName=sumneko.lua).

Make sure this extension, or a similar one, is installed before proceeding.

### Specify Aseprite Location

Go to the Aseprite Debugger extension settings, and change the 'Aseprite Exe' property to a path pointing to an aseprite executable file.

![Aseprite Exe Screenshot](https://github.com/zarstensen/AsepriteDebuggerVSC/blob/main/assets/AsepriteExeScreenshot.png?raw=true)

If installed through steam, its location can be determined by finding aseprite in your library, right clicking it and pressing the Manage > Browse local files item.

Alternatively, the located aseprite executable can be added to path, and then the default value will work out of the box.

### Specify Executable Architecture (optional)

*This step is not neccessarry for the majority of users, since the default value is likely to be correct for the majority of aseprite installs.*

Go to the Aseprite Debugger extension settings, and change the 'Aseprite Arch' property to the architecture of the aseprite executable pointed to by 'Aseprite Path'.

![Aseprite Arch Screenshot](https://github.com/zarstensen/AsepriteDebuggerVsc/blob/main/assets/AsepriteArchScreenshot.png?raw=true)

The architecture can be determined by examening the last section of the title bar title in an open Aseprite program.

## Setup VSCode Workspace for Debugging

To set up a Visual Studio Code workspace for Aseprite Debugging, follow the below steps.

- go to the 'Run and Debug' menu in the activity bar, and press 'create a launch.json file'.
- Select the 'Aseprite' debugger.
- Select 'script' or 'extension' depending on your project type.
- Select the location of the lua source files, this will be a file or a folder depending on the project type.
  If the extension project type was selected, the source folder must contain a valid package.json.

Debugging the workspace will now run Aseprite with the debugger attached, and the script or extension intalled in Aseprite.

The first time the debugger is run, Aseprite will prompt the user for script permissions, make sure to select 'Give full trust to this script' for the 'Aseprite Debugger' script when this pops up.

## Commands

To retreive the latest stacktrace from the debugger, the command 'Aseprite Debugger: Show Latest Stacktrace' can be used.
This will pause the debug session and show the stacktrace.
The debug session will terminate when continued, after this command has been used.

This command is primarily useful for getting the stacktrace of an error not caught by the debugger, see [Non Error Errors](#non-error-errors).

## Limitations

### Editing Source Files Whilst Debugging

If a source file is modified whilst debugging, the changes will not be reflected until the debug session has been restarted, as the source files are installed only on debug session starts.

### Aseprite Control

The Aseprite application will freeze preventing any user interaction, when the debugger is paused.
This is caused by the debugger needing to block the currently running lua script, which in turn blocks the entire Aseprite application process.

### Extension Name

The debugged extension must not start with '!', as it would no longer be guaranteed for the debugger to be loaded as the first extension.

### Lua Globals

The debugger lives inside the ASEDEB global namespace, so this value should not be modified in any scripts or extensions running in Aseprite.
Additionally, the debugger overrides the global 'print' and 'error' functions, so these should not be reassigned, without calling the original print and error functions inside the reassigned functions.

### Non Error Errors

The debugger is not able to catch an error, if it was not caused by a call to 'error'.
If an error is hit, and it is not caught by the debugger, you can use the 'Aseprite Debugger: Show Latest Stacktrace' as a workaround for getting the stacktrace of the error, provided no other scripts have run after the error was thrown.

## Built With

- [Aserite Debugger](https://github.com/zarstensen/AsepriteDebugger)
- See [package.json](package.json) for node modules.

## Links

[Github](https://github.com/zarstensen/AsepriteDebuggerVsc)

[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zarstensen.aseprite-debugger)

## License

See [LICENSE](LICENSE)
