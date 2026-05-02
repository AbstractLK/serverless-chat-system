import archiver from 'archiver';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';

mkdirSync('dist', { recursive: true });

async function zipApplication() {
  const output = createWriteStream(join('dist', 'app.zip'));
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);
  archive.directory('src/', 'src');
  archive.directory('node_modules/', 'node_modules');
  archive.file('package.json', { name: 'package.json' });

  await archive.finalize();
  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });
}

await zipApplication();
console.log('Packaged dist/app.zip');
