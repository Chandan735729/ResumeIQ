import winston from 'winston';

/**
 * Logger Service
 * 
 * Why centralized logging?
 * - Consistent log format across application
 * - Easy to switch logging providers (Winston, Bunyan, etc)
 * - Structured logging for analytics
 * - Different log levels for different environments
 */

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaKeys = Object.keys(meta);
    const metaStr = metaKeys.length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);


const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      format,
    ),
  }),

  // Error log file
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(
      winston.format.uncolorize(),
      format,
    ),
  }),

  // All logs file
  new winston.transports.File({
    filename: 'logs/all.log',
    format: winston.format.combine(
      winston.format.uncolorize(),
      format,
    ),
  }),
];

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  levels,
  format,
  transports,
});
