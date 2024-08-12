export interface Logger {
    log(message: string): void
    info(message: string): void
    error(message: string): void
    clear(): void
}

class GeneralLoggerImpl implements Logger {
    constructor(private readonly type: string, private readonly module: string | null) { }

    private getTag(): string {
        if (this.module) {
            return `${this.type}::${this.module}`
        } else {
            return this.type
        }
    }

    private multiLog(messgae: string, fn: (messgae: string) => void) {
        messgae.split("\n").forEach(it => fn(it))
    }

    log(message: string): void {
        if (message.includes("\n")) {
            this.multiLog(message, this.log)
        } else {
            console.log(`(${Date.now()}) [${this.getTag()}] ${message}`)
        }
    }

    info(message: string): void {
        this.log(message)
    }
    error(message: string): void {
        if (message.includes("\n")) {
            this.multiLog(message, this.error)
        } else {
            console.error(`(${Date.now()}) [${this.getTag()}] ${message}`)
        }
    }

    clear() {
        console.clear()
    }
}

export function createHostLogger(module: string | null = null): Logger {
    return new GeneralLoggerImpl("Host", module)
}

export function createRemoteLogger(module: string | null = null): Logger {
    return new GeneralLoggerImpl("Remote", module)
}