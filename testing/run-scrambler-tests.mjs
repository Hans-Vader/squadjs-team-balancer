/**
 * Entry point for the scrambler stress-test suite when run from this repo.
 * Same rationale as run-logic-tests.mjs: register() must run before the
 * runner's static imports resolve, so the wrapper is a separate module.
 */
import { register } from 'node:module';

register('./dev-loader.mjs', import.meta.url);

await import('./scrambler-test-runner.js');
