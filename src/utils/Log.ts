/**
 * Deliberately dependency-free logger.
 *
 * The console output is read live while tests run, so the format is optimised
 * for scanning: time, level, worker, message. The worker matters because
 * parallel runs interleave output.
 */
function time(): string {
    const now = new Date();
    const pad = (value: number, width = 2) => String(value).padStart(width, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

function write(level: string, message: string): void {
    const worker = `worker-${process.env.TEST_WORKER_INDEX ?? 'main'}`;
    console.log(`${time()} | ${level} | ${worker.padEnd(22)} | ${message}`);
}

export const Log = {
    info(message: string): void {
        write('INFO ', message);
    },

    step(message: string): void {
        write('STEP ', message);
    },

    pass(message: string): void {
        write('PASS ', message);
    },

    warn(message: string): void {
        write('WARN ', message);
    },

    error(message: string, error?: unknown): void {
        if (error instanceof Error) {
            write('ERROR', `${message} -> ${error.name}: ${error.message}`);
        } else {
            write('ERROR', message);
        }
    },
};
