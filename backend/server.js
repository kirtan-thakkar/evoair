import app from './app.js';
import connectDB, { closeDb } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const PORT = env.PORT;

let server;

// Start Server
const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    logger.error({ err: error }, `PostgreSQL connection failed: ${error.message}`);
    logger.warn(
      'PostgreSQL is not reachable on localhost:5432. Start Docker Desktop and run `docker compose up -d` in backend/ (or start your local PostgreSQL service).'
    );

    if (env.NODE_ENV === 'production') {
      logger.fatal('Database connection is required in production. Exiting.');
      process.exit(1);
    }
  }

  server = app.listen(PORT, () => {
    logger.info(`Server running in ${env.NODE_ENV} mode on port ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use by another process. Please close existing node instances.`);
    } else {
      logger.error({ err }, 'Server error:');
    }
  });
};

startServer();

const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await closeDb();
        logger.info('PostgreSQL connection pool closed.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error closing PostgreSQL connection:');
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }

  // Force close if taking too long (e.g., 10 seconds)
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals (SIGINT from Ctrl+C, SIGTERM from Docker/Render/Railway)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions and unhandled rejections globally
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception!');
  if (env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled Rejection caught:');
  if (env.NODE_ENV === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});
