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
    lang: 'zh' | 'en';
    interactive: boolean;
  }

  function parseArgs(argv: string[]): ParsedArgs {
    const result: ParsedArgs = { force: false, raw: false, lang: 'en', interactive: false };

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
        case '--lang': {
          const v = argv[++i];
          if (v !== 'zh' && v !== 'en') {
            console.error(`Invalid --lang value: ${v} (expected: zh or en)`);
            process.exit(1);
          }
          result.lang = v;
          break;
        }
        case '--en':
          result.lang = 'en';
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
    startApp(parsed.lang);
  } else {
    const { run } = await import('./pipeline.js');
    await run({ date: parsed.date, force: parsed.force, raw: parsed.raw, lang: parsed.lang });
  }
}
