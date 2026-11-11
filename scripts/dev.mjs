#!/usr/bin/env bun

import { execSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};

const WEB_PORT = Number(process.env.WEB_PORT ?? 3000);
const API_PORT = Number(process.env.API_PORT ?? 3333);
const STUDIO_PORT = Number(process.env.STUDIO_PORT ?? 5555);
const WITH_STUDIO = process.argv.includes('--studio');

function clearStalePorts() {
  const ports = WITH_STUDIO
    ? [WEB_PORT, API_PORT, STUDIO_PORT]
    : [WEB_PORT, API_PORT];
  const isWin = process.platform === 'win32';

  for (const port of ports) {
    try {
      if (isWin) {
        const res = execSync(`netstat -ano | findstr :${port}`, {
          encoding: 'utf8',
        });
        for (const line of res.split('\n')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts.at(-1);
          if (pid && !Number.isNaN(Number(pid)) && Number(pid) !== process.pid) {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          }
        }
      } else {
        const output = execSync(`lsof -ti :${port}`, {
          encoding: 'utf8',
        }).trim();
        if (output) {
          for (const rawPid of output.split('\n').filter(Boolean)) {
            const pid = Number.parseInt(rawPid, 10);
            if (pid && pid !== process.pid) {
              try {
                process.kill(pid, 'SIGKILL');
              } catch {
                // Process already exited.
              }
            }
          }
        }
      }
    } catch {
      // Port is already free.
    }
  }
}

clearStalePorts();

console.log(`
${COLORS.cyan}${COLORS.bold}╔══════════════════════════════════════════════════════════════════╗
║                OPENPANEL UNIFIED DEV ENGINE                     ║
╚══════════════════════════════════════════════════════════════════╝${COLORS.reset}

  ${COLORS.green}${COLORS.bold}Frontend:${COLORS.reset}  http://localhost:${WEB_PORT}
  ${COLORS.blue}${COLORS.bold}Backend:${COLORS.reset}   http://localhost:${API_PORT}${
    WITH_STUDIO
      ? `\n  ${COLORS.cyan}${COLORS.bold}Studio:${COLORS.reset}    http://localhost:${STUDIO_PORT}`
      : ''
  }

${COLORS.gray}────────────────────────────────────────────────────────────────────
  Press Ctrl + C to stop all services cleanly.
────────────────────────────────────────────────────────────────────${COLORS.reset}
`);

const services = [
  {
    name: 'BACKEND',
    color: COLORS.blue,
    cmd: 'bun',
    args: ['run', '--filter', '@openpanel/backend', 'testing'],
  },
  {
    name: 'FRONTEND',
    color: COLORS.green,
    cmd: 'bun',
    args: ['run', '--filter', '@openpanel/frontend', 'dev'],
  },
];

if (WITH_STUDIO) {
  services.push({
    name: 'STUDIO',
    color: COLORS.cyan,
    cmd: 'bun',
    args: ['run', '--filter', '@openpanel/db', 'studio'],
  });
}

const children = [];
let isShuttingDown = false;

function filterNoisyLines(line) {
  if (!line?.trim()) {
    return false;
  }
  return !(
    line.startsWith('> @openpanel/') || line.includes('Failed to benchmark file I/O')
  );
}

function launchService(service) {
  const child = spawn(service.cmd, service.args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  children.push(child);

  const prefix = `${service.color}${COLORS.bold}[${service.name.padEnd(8)}]${COLORS.reset} `;

  createInterface({ input: child.stdout }).on('line', (line) => {
    if (filterNoisyLines(line)) {
      console.log(`${prefix}${line}`);
    }
  });

  createInterface({ input: child.stderr }).on('line', (line) => {
    if (filterNoisyLines(line)) {
      console.error(`${prefix}${line}`);
    }
  });

  child.on('error', (err) => {
    console.error(
      `${prefix}${COLORS.yellow}Error: ${err.message}${COLORS.reset}`
    );
  });

  child.on('close', (code) => {
    if (code && code !== 0 && !isShuttingDown) {
      console.log(
        `${prefix}${COLORS.yellow}Exited (code ${code}). Restarting in 2s...${COLORS.reset}`
      );
      setTimeout(() => {
        if (!isShuttingDown) {
          launchService(service);
        }
      }, 2000);
    }
  });
}

for (const service of services) {
  launchService(service);
}

function cleanup() {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(
    `\n${COLORS.yellow}Shutting down all OpenPanel services...${COLORS.reset}`
  );
  for (const child of children) {
    try {
      if (child.pid) {
        if (process.platform === 'win32') {
          execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
        } else {
          try {
            process.kill(-child.pid, 'SIGTERM');
          } catch {
            child.kill('SIGTERM');
          }
        }
      }
    } catch {
      // ignore
    }
  }

  setTimeout(() => {
    clearStalePorts();
    process.exit(0);
  }, 400);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
