# cl5-sdk
[![npm version](https://img.shields.io/npm/v/@timkendrick/cl5-sdk.svg)](https://www.npmjs.com/package/@timkendrick/cl5-sdk.svg)

> Scripting toolkit for the CL5 animation tool

## Installation

```bash
npm install -g @timkendrick/cl5-sdk
```

This will make the `cl5` command globally available.

## Usage

Compile an animation into a JavaScript file:

```bash
cl5 compile /path/to/animation.json --output=/path/to/output.js
```

> The resulting JavaScript file can be loaded into the CL5 animation editor page by pasting its contents into the browser console

Preview an animation in browser:

```bash
cl5 preview /path/to/animation.json --watch
```

> This will launch a browser with the animation injected into the viewer, and automatically recompile the animation and reload the page whenever the animation file changes

Watching additional source files:

```bash
cl5 preview /path/to/animation.json --watch=/path/to/animation/resources/*.svg
```

> This will additionally recompile the animation and reload the page whenever the additional files are changed

Full usage instructions:

```bash
cl5 --help
```

```bash
cl5 compile --help
```

```bash
cl5 preview --help
```

## Animation file format

See the [animation file reference](docs/animation-file-format.md) for instructions on creating valid CL5 animation files.
