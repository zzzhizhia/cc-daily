import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Symlink entry guard — required for npx/npm bin symlinks
const currentFile = fileURLToPath(import.meta.url);
const isDirectRun =
  process.argv[1] != null &&
  resolve(realpathSync(process.argv[1])) === currentFile;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

async function main() {
  const args = process.argv.slice(2);

  interface ParsedArgs {
    date?: string;
    force: boolean;
    raw: boolean;
    interactive: boolean;
  }

  function parseArgs(argv: string[]): ParsedArgs {
    const result: ParsedArgs = { force: false, raw: false, interactive: false };

    for (let i = 0; i < argv.length; i++) {
      switch (argv[i]) {
        case '-d':
          result.date = argv[++i];
          break;
        case '--force':
          result.force = true;
          break;
        case '--raw':
          result.raw = true;
          break;
        default:
          console.error(`Unknown argument: ${argv[i]}`);
          process.exit(1);
      }
    }

    result.interactive = !result.date && !result.raw;
    return result;
  }

  const parsed = parseArgs(args);

  if (parsed.interactive) {
    const { default: startApp } = await import('./app.js');
    startApp();
  } else {
    const { run } = await import('./pipeline.js');
    await run({ date: parsed.date, force: parsed.force, raw: parsed.raw });
  }
}
