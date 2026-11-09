// Lets Node's built-in test runner load the app's TypeScript directly (no test framework needed):
// resolves the "@/..." path alias and extensionless imports to .ts files. Node 24 strips the types.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');

function withTs(p) {
  for (const cand of [p, `${p}.ts`, `${p}.tsx`, path.join(p, 'index.ts')]) {
    if (existsSync(cand) && !cand.endsWith(path.sep) && path.extname(cand)) return cand;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, next) {
    let file = null;
    if (specifier.startsWith('@/')) file = withTs(path.join(ROOT, specifier.slice(2)));
    else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:') && !path.extname(specifier))
      file = withTs(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    return file ? next(pathToFileURL(file).href, context) : next(specifier, context);
  },
});
