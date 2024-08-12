import fs from 'fs'
import path from 'path'

import frida = require('frida')
import esbuild = require('esbuild')

import { createHostLogger } from './logger'
import { HostCompleteConfig } from './config'

export * from './config'

const logger = createHostLogger()
const esbuildLogger = createHostLogger("ESBuild")
let loadedScript: frida.Script | null = null


function watchAll(targets: MetaInputs, triggerRebuild: fs.WatchListener<string>) {
    for (const file in targets) {
        logger.log(`Watching ${path.join(process.cwd(), file)}...`)
        fs.watch(path.join(process.cwd(), file), triggerRebuild)
    }
}

async function launchRemoteScript(session: frida.Session, scriptFile: string, conf: HostCompleteConfig) {
    const script = fs.readFileSync(scriptFile)
    if (loadedScript && !loadedScript.isDestroyed) {
        await loadedScript.unload()
    }

    loadedScript = await session.createScript(script.toString('utf-8'))
    loadedScript.message.connect((message, buffer) => {
        if (message.type === "error") { 
            if (conf.errorHandler) {
                conf.errorHandler(message)
            } else {
                logger.error(`(${Date.now()}) [Remote] Error: ${message.description}\n${message.stack}`)
            }
            return
        }

        if (conf.messageHandler) {
            conf.messageHandler(message, buffer)
            return
        }

        logger.log(`(${Date.now()}) [Remote] ${message.payload}`)
    })

    await loadedScript.load()
}

type MetaInputs = {
    [path: string]: {
      bytes: number
      imports: {
        path: string
        kind: esbuild.ImportKind
        external?: boolean
        original?: string
        with?: Record<string, string>
      }[]
      format?: 'cjs' | 'esm'
      with?: Record<string, string>
    }
  }

export async function buildBundle(ctx: esbuild.BuildContext): Promise<MetaInputs | null> {

    try {
        const result = await ctx.rebuild()

        if (result.errors.length > 0) {
            esbuildLogger.error(`Error while building remote script: ${result.errors}`)
            return null
        }
        return result.metafile!.inputs ?? null
    } catch (ex) {
        esbuildLogger.error(`Error while building remote script: ${ex}`)
        return null
    }
}

export async function startHost(conf: HostCompleteConfig) {
    esbuildLogger.log(`Creating script bundle...`)

    const outfile = conf.output
    const esbuildCtx = await esbuild.context({
        entryPoints: [ conf.entryPoint ],
        bundle: true,
        minify: false,
        sourcemap: true,
        outfile,
        format: "cjs",
        metafile: true,
    })

    const sources = await buildBundle(esbuildCtx)
    if (!sources) {
        esbuildLogger.error(`Failed to build script bundle! Exiting...`)
        process.exit(1)
    }

    const device = await conf.createDeviceConnection()
    let session: frida.Session | null = null
    const pref = conf.getAttachPreferenceInDetails()
    for (let i = 0; i < pref.maxAttempts && !session; i++) {
        try {
            session = await conf.tryCreateSession()
        } catch(ex) {
            logger.log(`App not found, retrying in ${pref.delay / 1000}s...`)
            await (new Promise(resolve => setTimeout(resolve, pref.delay)))
            continue
        }
    }

    if (!session) {
        logger.error(`Failed to attach to target process after ${pref.maxAttempts} retries! Giving up...`)
        return
    }

    await session.enableChildGating()

    let rebuilding = false
    watchAll(sources!, async (event, filename) => {
        if (rebuilding) return
        if (session.isDetached) {
            logger.error(`Session detached! Exiting...`)
            process.exit(0)
        }

        rebuilding = true
        logger.clear()
        logger.log(`Script modification detected! Rebuilding...`)

        rebuilding &&= Boolean(await buildBundle(esbuildCtx))

        logger.log(`Launching script...`)

        await launchRemoteScript(session, outfile, conf)

        rebuilding = false
    })


    logger.log(`Launching script...`)
    await launchRemoteScript(session, outfile, conf)

    await session.resume()
}
