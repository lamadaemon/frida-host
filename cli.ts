#!/usr/bin/env node

import process from 'process'
import { defineConfig, startHost } from ".";
import { program } from "commander";

program
    .name("frida-host")
    .description("Host scripts for Frida")
    .version("1.0")

type ProgramOptions = {
    target: string,
    package: string,
    attach: 'always' | 'try' | 'never',
    retries: number,
    delay: number,
    spawn: boolean,
    output: string,
    device: 'usb' | 'local',
    usb: boolean,
    local: boolean
}

program
    .argument("<script>", "Script to host")
    .option("-p, --package <package>", "Target package name")
    .option("-t, --target <target>", "Target process name")
    .option("-a, --attach", "Never spawn the target app")
    .option("-s, --spawn [pref]", "Spawn preference", "always")
    .option("-r, --retries <retries>", "Number of retries", "15")
    .option("-D, --delay <delay>", "Delay between each retry in ms", "1000")
    .option("-o, --output <output>", "Output file")
    .option("-d, --device <device>", "Device type")
    .option("-u, --usb", "Use USB device")
    .option("-l, --local", "Use local device")
    .description("Host a script for Frida")
    .action(async (script: string, options: ProgramOptions) => { 
        try {
            const conf = defineConfig({
                target: {
                    name: options.target,
                    package: options.package,
                    source: options.usb ? "usb" : options.local ? "local" : options.device ? options.device : "usb",
                },
                attachPreference: {
                    spawn: options.attach ? options.attach : options.spawn ? "always" : "try",
                    maxAttempts: options.retries,
                    delay: options.delay
                },
                output: options.output,
                entryPoint: script
            })
    
            await startHost(conf)
        } catch (e) {
            console.error(e)
            process.exit(1)
        }
    })

program.parse()