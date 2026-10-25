import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import {
  launchVite,
  projectRoot,
  reservePort,
  within,
} from './support/vite-process.js';

async function probe(baseURL: string, path: string) {
  const response = await fetch(`${baseURL}${path}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(3_000),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('location')).toBeNull();
  const body = await response.text();
  console.info(
    `HTTP ${path}: status=${response.status}, redirect=false${path === '/healthz' || path === '/build-id' ? `, body=${JSON.stringify(body)}` : ''}`,
  );
  return { response, body };
}

test('serves health and exact supplied identity on IPv4 loopback only', async () => {
  const candidate = ' factory-v1:m0-exact\n';
  const server = await launchVite(candidate);
  try {
    await server.ready();
    const home = await probe(server.baseURL, '/');
    expect(home.response.headers.get('content-type')).toContain('text/html');
    expect(home.body).toContain('<div id="root">');
    expect(home.body).toContain('/src/main.tsx');
    for (const [path, expected] of [
      ['/healthz', 'ok'],
      ['/build-id', candidate],
    ] as const) {
      const { response, body } = await probe(server.baseURL, path);
      expect(body).toBe(expected);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-type')).toContain('text/plain');
    }
    const sockets = execFileSync('ss', ['-ltnp'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.includes(`pid=${server.pid},`));
    console.info(`Socket observation: ${sockets.join('\n')}`);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.trim().split(/\s+/)[3]).toBe(`127.0.0.1:${server.port}`);
  } finally {
    await server.stop();
  }
});

test('reports current Git HEAD without candidate', async () => {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    cwd: projectRoot,
  }).trim();
  const server = await launchVite();
  try {
    await server.ready();
    expect((await probe(server.baseURL, '/build-id')).body).toBe(revision);
  } finally {
    await server.stop();
  }
});

test('rejects an occupied port without disturbing its listener', async () => {
  const sentinel = await reservePort();
  const server = await launchVite('occupied-port', sentinel.port);
  try {
    expect(await within(server.exited, 10_000)).toBe(1);
    expect(server.output()).toContain(
      `Port ${sentinel.port} is already in use`,
    );
    expect(sentinel.server.listening).toBe(true);
    console.info(
      `Occupied 127.0.0.1:${sentinel.port}: Vite exit=1; sentinel still listening`,
    );
  } finally {
    await server.stop();
    await sentinel.close();
  }
});

async function sourceDigest() {
  const files = [
    'index.html',
    'package.json',
    'package-lock.json',
    'vite.config.cjs',
    'node_modules/vite/package.json',
    'node_modules/vite/dist/node/index.js',
    'node_modules/@vitejs/plugin-react/dist/index.js',
    ...(
      await readdir(join(projectRoot, 'src'), {
        recursive: true,
        withFileTypes: true,
      })
    )
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name)),
  ];
  const digest = createHash('sha256');
  for (const file of files.sort())
    digest.update(await readFile(resolve(projectRoot, file)));
  return digest.digest('hex');
}

async function configTemps() {
  return readdir(join(projectRoot, 'node_modules/.vite-temp')).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
}

test('uses fresh state without changing source or config-loader cache', async () => {
  const before = await sourceDigest();
  const temps = await configTemps();
  const states: string[] = [];
  for (const candidate of ['fresh-one', 'fresh-two']) {
    const server = await launchVite(candidate);
    states.push(server.state);
    try {
      await server.ready();
      expect((await probe(server.baseURL, '/build-id')).body).toBe(candidate);
      const main = await probe(server.baseURL, '/src/main.tsx');
      const dependencies = [
        ...main.body.matchAll(/from "(\/@fs\/[^" ]+)"/g),
      ].flatMap((match) => match[1] ?? []);
      expect(dependencies.length).toBeGreaterThan(0);
      for (const dependency of dependencies) {
        expect(dependency).toContain(`${server.state}/vite/`);
        await probe(server.baseURL, dependency);
      }
      const cache = await readdir(join(server.state, 'vite'), {
        recursive: true,
      });
      expect(cache.length).toBeGreaterThan(0);
      console.info(`Cache beneath ${server.state}/vite: ${cache.join(', ')}`);
      expect(await sourceDigest()).toBe(before);
      expect(await configTemps()).toEqual(temps);
    } finally {
      await server.stop();
    }
  }
  expect(new Set(states).size).toBe(2);
});
