import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const projectRoot = resolve(import.meta.dirname, '../..');

export async function within<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Timed out waiting for owned process')),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function reservePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing TCP address');
  return {
    port: address.port,
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export function runtimeEnv(candidate: string | undefined, state: string) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FACTORY_RUNTIME_STATE: state,
  };
  delete env.FACTORY_RUNTIME_CANDIDATE;
  if (candidate !== undefined) env.FACTORY_RUNTIME_CANDIDATE = candidate;
  return env;
}

export async function launchVite(candidate?: string, occupiedPort?: number) {
  const state = await mkdtemp(join(tmpdir(), 'muicraft-test-'));
  let port = occupiedPort;
  if (port === undefined) {
    const reservation = await reservePort();
    port = reservation.port;
    await reservation.close();
  }
  const argv = [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ];
  const child = spawn(process.execPath, argv, {
    cwd: projectRoot,
    env: runtimeEnv(candidate, state),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let closed = false;
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      closed = true;
      resolve(code);
    });
  });
  const baseURL = `http://127.0.0.1:${port}`;
  return {
    state,
    port,
    baseURL,
    pid: child.pid,
    exited,
    output: () => output,
    async ready() {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        if (closed) throw new Error(`Vite exited before readiness: ${output}`);
        try {
          const response = await fetch(`${baseURL}/healthz`, {
            redirect: 'manual',
            signal: AbortSignal.timeout(500),
          });
          if (response.status === 200 && (await response.text()) === 'ok')
            return;
        } catch {
          /* The owned child may still be binding its socket. */
        }
        await delay(50);
      }
      throw new Error(`Vite readiness timed out: ${output}`);
    },
    async stop() {
      if (!closed) {
        child.kill('SIGTERM');
        try {
          await within(exited, 5_000);
        } catch {
          child.kill('SIGKILL');
          await within(exited, 5_000);
        }
      }
      await rm(state, { recursive: true, force: true });
      console.info(
        `Vite pid=${child.pid} closed=${closed}; removed state=${state}`,
      );
    },
  };
}
