type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const base = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    return meta ? `${base} ${JSON.stringify(meta)}` : base;
}

export const logger = {
    info: (message: string, meta?: Record<string, unknown>) => {
        console.log(formatMessage('info', message, meta));
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
        console.warn(formatMessage('warn', message, meta));
    },
    error: (message: string, meta?: Record<string, unknown>) => {
        console.error(formatMessage('error', message, meta));
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
        if (process.env.NODE_ENV !== 'production') {
            console.debug(formatMessage('debug', message, meta));
        }
    },
};
