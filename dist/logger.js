"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.setLogLevel = setLogLevel;
const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
const COLORS = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';
let currentLevel = 'info';
function setLogLevel(level) {
    currentLevel = level;
}
function log(level, ...args) {
    if (LEVELS[level] < LEVELS[currentLevel])
        return;
    const time = new Date().toTimeString().slice(0, 8);
    const prefix = `${COLORS[level]}[${time}] [${level.toUpperCase()}]${RESET}`;
    console.log(prefix, ...args);
}
exports.logger = {
    debug: (...args) => log('debug', ...args),
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
};
//# sourceMappingURL=logger.js.map