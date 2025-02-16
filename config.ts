import fs from 'fs'
import path from 'path'
import process from 'process'
import frida = require('frida')
import esbuild = require('esbuild')

/**
 * How should the script be connected to the target app.
 * 
 * - `usb`: Use remote device that is connected via USB, usually a phone.
 * - `local`: The device that is running this script.
 */
export type DeviceSource = 'usb' | 'local'

/**
 * Whether to spawn the target app before attach.
 * 
 * - 'always': Always spawn the target app.
 * - 'never': Never spawn the target app. Attach to existed process only.
 * - 'try': Try to attach if the target app exists otherwise spawn the target app.
 */
export type AttachPreference = 'always' | 'try' | 'never' | AttachPreferenceDetails

export type AttachPreferenceDetails = {
    /**
     * Whether to spawn the target app.
     * 
     * - 'always': Always spawn the target app.
     * - 'never': Never spawn the target app. Attach to existed process only.
     * - 'try': Try to attach if the target app exists otherwise spawn the target app.
     */
    spawn: Exclude<AttachPreference, AttachPreferenceDetails>,
    
    /**
     * Maximum attempts to *attach* to the target process.
     * 
     * Default: `15`
     */
    maxAttempts?: number,

    /**
     * Delay between each attach attempt in milliseconds.
     * 
     * Default: `1000`
     */
    delay?: number
}

export type TargetInformation = {
    /**
     * The process name of the target application.
     */
    name: string,

    /**
     * The process package name of the target application.
     */
    package: string,

    /**
     * The source of the target application.
     * 
     * - `usb`: Use remote device that is connected via USB, usually a phone.
     * - `local`: Use the local device
     */
    source: DeviceSource,
}

export type FridaHostConfigBase = {
    /**
     * The entrypoint of your remote script.
     * Must be a path to a file.
     * 
     * Recommended project structure:
     *   - remote/
     *     - init.js or init.ts (entrypoint)
     *     - other files...
     *   - host/
     *     - ff.config.ts (your config file)
     *     - other files... (Command hooks)
     */
    entryPoint?: string,

    /**
     * Information about the target application.
     */
    target: TargetInformation

    /**
     * Where should the created bundle be saved.
     * Can be a file or a directory.
     * If a directory is provided, the bundle will be saved as `${output}/remote.bundle.js`.
     * 
     * This bundle file can be treated as a temporary file.
     * Default: `./remote.bundle.js`
     */
    output?: string,

    /**
     * Whether to **spawn** the target app before attach.
     * 
     * - 'always': Always spawn the target app.
     * - 'never': Never spawn the target app. Attach to existed process only.
     * - 'try': Try to attach if the target app exists otherwise spawn the target app.
     */
    attachPreference?: AttachPreference,

    /**
     * Additional esbuild configuration.
     */
    esbuildConfig?: Omit<esbuild.BuildOptions, 'entryPoints' | 'outfile' | 'format'>,

    messageHandler?: (message: frida.SendMessage, data: Buffer | null) => void
    errorHandler?: (message: frida.ErrorMessage) => void
}

type ConfigExtension = {
    device?: frida.Device

    getOutputBundleFile(): string
    spawnAppSession(): Promise<number>
    createDeviceConnection(): Promise<frida.Device>
    getTargetAppPID(): Promise<number>
    tryCreateSession(): Promise<frida.Session | null>
    getAttachPreference(): Exclude<AttachPreference, AttachPreferenceDetails>
    getAttachPreferenceInDetails(): Required<AttachPreferenceDetails>
}

export type FridaHostConfig = FridaHostConfigBase & ConfigExtension

type AnyFunction = (...a: any) => any
type RemapThis<F extends AnyFunction, R> = (this: R, ...a: Parameters<F>) => ReturnType<F>

type ConfigExtensionImpl = {
    // Select all properties from ConfigExtension except 'device'
    // and then remap the 'this' type to FridaHostConfig
    [K in keyof Omit<ConfigExtension, 'device'>]: RemapThis<ConfigExtension[K], HostCompleteConfig>
}

const extensionImpl: ConfigExtensionImpl = {
    getOutputBundleFile() {
        if (this.output) {
            if (fs.statSync(this.output).isDirectory()) {
                return `${this.output}/remote.bundle.js`
            } else {
                return this.output
            }
        } else {
            return "./remote.bundle.js"
        }
    },

    async createDeviceConnection() {
        if (this.target.source === "usb") {
            return this.device = await frida.getUsbDevice()
        } else {
            return this.device = await frida.getLocalDevice()
        }
    },

    async getTargetAppPID() {
        if (!this.device) {
            throw new Error(`Device connection not established`)
        }

        const processes = await this.device.enumerateProcesses()
        const targetProcess = processes.find(it => it.name === this.target.name || it.name === this.target.package)
        if (targetProcess) {
            return targetProcess.pid
        } else {
            throw new Error(`Target process not found: ${this.target.name}`)
        }
    },

    async spawnAppSession() {
        if (!this.target.package) { 
            throw new Error(`Target package must be provided to spawn the app. Hint: It's always a good idea to provide both package and name.`)
        }

        if (!this.device) {
            throw new Error(`Device connection not established`)
        }

        return await this.device.spawn(this.target.package)
    },
    

    async tryCreateSession() {
        if (!this.device) {
            throw new Error(`Device connection not established`)
        }

        let pid = -1
        const pref = this.getAttachPreferenceInDetails()
        if (pref.spawn === 'always') {
            try {
                const pid = await this.spawnAppSession()

                if (!pid) {
                    throw new Error(`Failed to spawn target process (${pid})`)
                }

                return await this.device.attach(pid)
            } catch (ex) {
                throw new Error(`Failed to spawn target process: ${ex}`)
            }
        }

        try {
            pid = await this.getTargetAppPID()
        } catch (ex) {
            if (pref.spawn === 'try') {
                try {
                    pid = await this.spawnAppSession()
                } catch (exception) {
                    throw new Error(`Failed to spawn or attach to target process: ${exception}`)
                }
            } else {
                throw ex
            }
        }

        if (pid === -1) {
            throw new Error(`Failed to get target process PID`)
        }

        return await this.device.attach(pid)
    },
    getAttachPreference: function (this: FridaHostConfig): 'always' | 'try' | 'never' {
        if (!this.attachPreference) {
            return 'try'
        }
        
        if (typeof this.attachPreference === 'string') {
            return this.attachPreference
        } else {
            return this.attachPreference.spawn
        }
    },
    getAttachPreferenceInDetails: function (this: FridaHostConfig): Required<AttachPreferenceDetails> {
        if (typeof this.attachPreference === 'string') {
            return {
                spawn: this.attachPreference ?? 'try',
                maxAttempts: 15,
                delay: 5000
            }
        } else {
            return {
                spawn: this.attachPreference?.spawn ?? 'try',
                maxAttempts: this.attachPreference?.maxAttempts ?? 15,
                delay: this.attachPreference?.delay ?? 5000
            }
        }
    }
}

type DefaultConfig = Omit<FridaHostConfigBase, 'target'>

type CompleteDefaultConfig = {
    [k in keyof DefaultConfig]-?: DefaultConfig[k]
}

const defaultConfig: CompleteDefaultConfig = {
    entryPoint: "./remote/init.js",
    output: "./remote.bundle.js",
    attachPreference: "try",
    esbuildConfig: { },
    messageHandler: function (message: frida.SendMessage, data: Buffer | null): void { },
    errorHandler: function (message: frida.ErrorMessage): void { }
}


export type HostCompleteConfig = {
    // Remove the optional modifier from all properties
    [key in keyof FridaHostConfigBase]-?: FridaHostConfigBase[key]
} & ConfigExtension


export function defineConfig(conf: FridaHostConfigBase): HostCompleteConfig {
    if (!(conf.target.name.length || conf.target.package.length)) {
        throw new Error(`Target name or package must be provided. Hint: It's always a good idea to provide both package and name.`)
    }

    conf.entryPoint = path.join(process.cwd(), conf.entryPoint ?? defaultConfig.entryPoint)
    conf.output = path.join(process.cwd(), conf.output ?? defaultConfig.output)

    return {
        ...defaultConfig,
        ...conf,
        ...extensionImpl
    }
}
