import { appendFileSync } from 'fs';

appendFileSync('dist/metamuxer.d.ts', '\nexport as namespace Metamuxer;');