import { execFile, execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, matchesGlob } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import { projectRoot, runtimeEnv } from './support/vite-process.js';

const execute = promisify(execFile);
const sourceFiles = [
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.cjs',
  'tsconfig.json',
  'tsconfig.node.json',
  'src',
];

async function build(root: string, state: string, candidate?: string) {
  return execute(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--outDir', join(state, 'dist')],
    {
      cwd: root,
      env: runtimeEnv(candidate, state),
      timeout: 20_000,
    },
  );
}

async function assertBuild(state: string, identity: string) {
  const output = join(state, 'dist');
  expect(await readFile(join(output, 'build-id'), 'utf8')).toBe(identity);
  const html = await readFile(join(output, 'index.html'), 'utf8');
  expect(html).toContain('<div id="root">');
  const assets = [
    ...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g),
  ].flatMap((match) => match[1] ?? []);
  expect(assets.some((path) => path.endsWith('.js'))).toBe(true);
  expect(assets.some((path) => path.endsWith('.css'))).toBe(true);
  for (const asset of assets)
    expect((await stat(join(output, asset))).size).toBeGreaterThan(0);
  console.info(
    `Build identity=${JSON.stringify(identity)}; nonempty assets=${assets.join(', ')}`,
  );
}

test('build emits current Git identity and executable assets', async () => {
  const state = await mkdtemp(join(tmpdir(), 'muicraft-build-'));
  try {
    await build(projectRoot, state);
    await assertBuild(
      state,
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: projectRoot,
        encoding: 'utf8',
      }).trim(),
    );
  } finally {
    await rm(state, { recursive: true, force: true });
  }
});

test('Git-free builds use exact injected identity without stale output and fail without identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muicraft-git-free-'));
  const state = await mkdtemp(join(tmpdir(), 'muicraft-build-'));
  try {
    for (const file of sourceFiles)
      await cp(join(projectRoot, file), join(root, file), { recursive: true });
    await symlink(
      join(projectRoot, 'node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    await expect(
      execute('git', ['rev-parse', '--show-toplevel'], { cwd: root }),
    ).rejects.toThrow();
    for (const candidate of ['source-commit:first\n', 'source-commit:second']) {
      await build(root, state, candidate);
      await assertBuild(state, candidate);
    }
    await expect(build(root, state)).rejects.toThrow(
      /git rev-parse --verify HEAD/,
    );
    console.info(
      'Git-free build without candidate: failed visibly as required',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(state, { recursive: true, force: true });
  }
});

test('production configuration wires the built artifact and excludes private context', async () => {
  const docker = await readFile(join(projectRoot, 'Dockerfile'), 'utf8');
  expect(docker).toMatch(/^FROM node:24\.22\.1-bookworm-slim AS build/m);
  expect(docker).toContain('RUN npm ci');
  expect(docker).toContain('COPY package.json package-lock.json ./');
  expect(docker).toContain(
    'COPY index.html vite.config.cjs tsconfig.json tsconfig.node.json ./',
  );
  expect(docker).toContain('COPY src ./src');
  expect(docker).toContain('ARG SOURCE_COMMIT');
  expect(docker).toContain(
    'RUN FACTORY_RUNTIME_CANDIDATE="$SOURCE_COMMIT" npm run build',
  );
  const validation = docker.match(/^RUN node -e '(.+)'$/m)?.[1];
  if (!validation) throw new Error('Missing source-commit validation');
  for (const candidate of ['', 'abc123', 'g'.repeat(40)]) {
    await expect(
      execute(process.execPath, ['-e', validation], {
        env: { ...process.env, SOURCE_COMMIT: candidate },
      }),
    ).rejects.toThrow(/SOURCE_COMMIT must be the full source Git commit/);
  }
  await execute(process.execPath, ['-e', validation], {
    env: { ...process.env, SOURCE_COMMIT: 'a'.repeat(40) },
  });
  const runtime = docker.split('FROM nginx:1.30.6-alpine AS runtime')[1];
  expect(runtime).toBeDefined();
  expect(runtime).toContain('COPY nginx.conf /etc/nginx/conf.d/default.conf');
  expect(runtime).toContain(
    'COPY --from=build /app/dist/ /usr/share/nginx/html/',
  );
  expect(runtime).toContain('EXPOSE 80');
  expect(runtime).not.toMatch(/npm|node_modules/);

  const nginx = await readFile(join(projectRoot, 'nginx.conf'), 'utf8');
  expect(nginx).toMatch(/listen 80;/);
  expect(nginx).toMatch(/root \/usr\/share\/nginx\/html;/);
  expect(nginx).toMatch(/location = \/healthz\s*\{[^}]*return 200 "ok";/);
  expect(nginx).toMatch(
    /location = \/build-id\s*\{\s*types \{ \}\s*default_type text\/plain;\s*add_header Cache-Control "no-store" always;\s*try_files \/build-id =404;/,
  );
  expect(nginx).toMatch(/location \/assets\/\s*\{\s*try_files \$uri =404;/);
  expect(nginx).toMatch(
    /location \/\s*\{\s*try_files \$uri \$uri\/ \/index.html;/,
  );

  const ignore = (await readFile(join(projectRoot, '.dockerignore'), 'utf8'))
    .trim()
    .split('\n');
  expect(ignore[0]).toBe('**');
  expect(ignore.slice(1).every((line) => line.startsWith('!'))).toBe(true);
  const allowed = ignore
    .slice(1)
    .map((line) => line.slice(1).replace(/\/$/, ''));
  const included = (file: string) =>
    allowed.some((pattern) => matchesGlob(file, pattern));
  for (const file of [
    ...sourceFiles,
    'src/app/App.tsx',
    'src/styles/global.css',
    'nginx.conf',
  ])
    expect(included(file), file).toBe(true);
  for (const file of [
    '.git/config',
    '.env',
    'credentials.json',
    'private/scenario.json',
    '.archon/config.yaml',
    '.factory/config',
    '.claude/config',
    'factory/runtime_host.py',
    'harness/ci.py',
    'AGENTS.md',
    'node_modules/react/index.js',
    'dist/index.html',
    'test-results/result.json',
  ])
    expect(included(file), file).toBe(false);
});
