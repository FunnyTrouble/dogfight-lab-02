import pino from 'pino';
import { config } from './config.js';
/** JSON-only stdout logging; sensitive keys omitted by pino redaction. */
export const logger = pino({ level: config.logLevel, redact: { paths: ['password','token','secret','authorization','req.headers.authorization'], censor: '[redacted]' } });
