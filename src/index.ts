import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './services/contact.service';

const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`, { env: config.nodeEnv });
});

async function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
        logger.info('HTTP server closed');
    });
    await prisma.$disconnect();
    logger.info('Database connection closed');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', { reason: String(reason) });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { message: error.message, stack: error.stack });
    process.exit(1);
});
