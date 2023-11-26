<div align="center">
  <h1 align="center">Aseprite Debugger for Visual Studio Code</h1>
  <img src=https://github.com/zarstensen/AsepriteDebugger/blob/main/assets/AsepriteDebuggerIcon.png?raw=true alt="Icon" width="200" height="200"/>
</div>

[![build](https://img.shields.io/github/actions/workflow/status/zarstensen/AsepriteDebugger/tests.yml?label=tests
)](https://github.com/zarstensen/AsepriteDebugger/actions/workflows/tests.yml) [![marketplace](https://img.shields.io/visual-studio-marketplace/v/zarstensen.aseprite-debugger?label=visual%20studio%20marketplace)](https://marketplace.visualstudio.com/items?itemName=zarstensen.aseprite-debugger)

This is an Visual Studio Code extension, which enables debugging of [Aseprite](https://www.aseprite.org/) scripts and extensions.

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
- [How To Use](#how-to-use)
  - [Script](#script)
  - [Extension](#extension)
  - [Commands](#commands)
- [Limitations](#limitations)
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

![Aseprite Arch Screenshot]([image.png](https://github.com/zarstensen/AsepriteDebuggerVSC/blob/main/assets/AsepriteArchScreenshot.png?raw=true))

The architecture can be determined by examening the last section of the title bar title in an open Aseprite program.

## How To Use

### Script

### Extension

### Commands

## Limitations

- aseprite control

- extension naming

- namespaces used
- global functions overridden

- non error errors

## Built With

- [Aserite Debugger](https://github.com/zarstensen/AsepriteDebugger)
- See [package.json](package.json) for node modules.

## Links

[Github](https://github.com/zarstensen/AsepriteDebuggerVsc)

[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zarstensen.aseprite-debugger)

## License

See [LICENSE](LICENSE)
