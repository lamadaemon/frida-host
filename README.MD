# frida-host

frida-host, a opensource software that allows you to use multiple source files
when using frida.

[![996.icu](https://img.shields.io/badge/link-996.icu-red.svg)](https://996.icu)
[![LICENSE](https://img.shields.io/badge/license-Anti%20996-blue.svg)](https://github.com/996icu/996.ICU/blob/master/LICENSE)

---

## Purpose

This project is useful when your script is going big.
This usually happen during reverse-engineering some C++ project 
that you may face reading a complex structure (class) in stdlib (like Vec or std::string).
Also this project can bring you Typescript support!

But you may ask, what's the difference between this project and `frida-compile`?

Basically, both can do the same thing, build bundles. 
The difference is that this project is more easy to use.
Check out the following table so you will know!

| /                 | **frida-host**     | frida-compile       |
|-------------------|--------------------|---------------------|
| Bundle creation   | ESBuild            | TSC                 |
| Performance       | ESBuild Level Fast | TSC Level Fast      |
| Attach to Process | :white_check_mark: | :x:                 |
| Reload-on-Change  | :white_check_mark: | :x:                 |
| Lightweight       | :white_check_mark: | :white_check_mark:  |
| Type checking     | :x:                | :white_check_mark:  |

## How to use

A recommend file stucture is given below
```
- remote/
    - init.js (default entrypoint)
    - other scripts...
- host.config.js (server file)
```

### Install necessary packages

```
pnpm install frida-host @types/frida-gum frida esbuild
```

`frida` package is required because frida node binding 
is compiled when you install the package, and the same concept
applies to esbuild, since it's written in golang. 

Typescript package is not required to use typescript in your project,
however it is recommended to install.
You should always run `tsc -noEmit` to do type checking 
becuase ESBuild does not do type checking at all.

```
# Optional if you'd like to use Typescript
pnpm install typescript -D
```

### Server File

You need to create a config file. Recommended name is 'ff.config.js'.
Use the following template to get started quickly.

```javascript
const { defineConfig, startHost } = require('frida-host')

const conf = defineConfig({
    target: {
        name: "App",
        package: "com.example.app",
        source: "usb"
    },
    attachPreference: "try",
    entryPoint: "./remote/init.js"
})

await startHost(conf)
```

### CLI

You can always use provided CLI to do the exactly same thing as Server File Method does.
However, some feature like messageHandler is impossible to implement in CLI tool,
so they are not exist in the CLI tool.
If you need to use messageHandler, you must use Server File Method

Here is an example on how to spawn and hook 'com.example.app' through usb
```
$ frida-host ./remote/init.js -u -p com.example.app -t App -s
```

For more help, please use `--help`

```
$ frida-host --help
```
