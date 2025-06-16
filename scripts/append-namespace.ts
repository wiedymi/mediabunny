import { appendFileSync } from 'fs';

appendFileSync('dist/mediabunny.d.ts', '\nexport as namespace Mediabunny;');
