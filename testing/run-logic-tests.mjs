/**
 * Entry point for the plugin logic test harness when run from this repo.
 *
 * register() must run BEFORE the runner's static imports are resolved, which
 * is why this wrapper exists as a separate module and imports the runner
 * dynamically. Inside a SquadJS deployment the runner can be executed
 * directly — the hook is a no-op there because the real modules resolve.
 */
import { register } from 'node:module';

register('./dev-loader.mjs', import.meta.url);

await import('./plugin-logic-test-runner.js');
