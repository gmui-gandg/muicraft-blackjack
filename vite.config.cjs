const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

/** @returns {string} */
function sourceIdentity() {
  if (process.env.FACTORY_RUNTIME_CANDIDATE !== undefined) {
    return process.env.FACTORY_RUNTIME_CANDIDATE;
  }
  const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
    cwd: __dirname,
    encoding: 'utf8',
  }).trimEnd();
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error('Expected the full source Git revision');
  }
  return revision;
}

/**
 * @param {string} identity
 * @param {string | undefined} ownedState
 * @returns {import('vite').Plugin}
 */
function runtimeIdentityPlugin(identity, ownedState) {
  return {
    name: 'runtime-identity',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/healthz' && request.url !== '/build-id') {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(request.url === '/healthz' ? 'ok' : identity);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build-id', source: identity });
    },
    closeBundle() {
      if (ownedState !== undefined) {
        rmSync(ownedState, { recursive: true, force: true });
      }
    },
  };
}

// CJS keeps Vite's bundled config loader from writing into frozen source/dependencies.
/** @returns {Promise<import('vite').UserConfig>} */
module.exports = async () => {
  const { default: react } = await import('@vitejs/plugin-react');
  const identity = sourceIdentity();
  const suppliedState = process.env.FACTORY_RUNTIME_STATE;
  const state = suppliedState ?? mkdtempSync(join(tmpdir(), 'muicraft-vite-'));
  return {
    plugins: [
      react(),
      runtimeIdentityPlugin(
        identity,
        suppliedState === undefined ? state : undefined,
      ),
    ],
    cacheDir: join(state, 'vite'),
    server: { host: '127.0.0.1', strictPort: true },
  };
};
