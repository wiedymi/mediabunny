import * as esbuild from 'esbuild';
import process from 'node:process';

const baseConfig = {
	entryPoints: ['src/index.ts'],
	bundle: true,
	logLevel: 'info'
};

const umdConfig = {
	...baseConfig,
	format: 'iife',

	// The following are hacks to basically make this an UMD module. No native support for that in esbuild as of today
	globalName: 'Metamuxer',

	footer: {
		js:
`if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Metamuxer)`
	}
};

const esmConfig = {
	...baseConfig,
	format: 'esm'
};

let ctxUmd = await esbuild.context({
	...umdConfig,
	outfile: 'dist/metamuxer.js'
});
let ctxEsm = await esbuild.context({
	...esmConfig,
	outfile: 'dist/metamuxer.mjs'
});
let ctxUmdMinified = await esbuild.context({
	...umdConfig,
	outfile: 'dist/metamuxer.min.js',
	minify: true
});
let ctxEsmMinified = await esbuild.context({
	...esmConfig,
	outfile: 'dist/metamuxer.min.mjs',
	minify: true
});

if (process.argv[2] === '--watch') {
	await Promise.all([
		ctxUmd.watch(),
		ctxEsm.watch(),
		ctxUmdMinified.watch(),
		ctxEsmMinified.watch(),
	]);
} else {
	ctxUmd.rebuild();
	ctxEsm.rebuild();
	ctxUmdMinified.rebuild();
	ctxEsmMinified.rebuild();

	await Promise.all([
		ctxUmd.dispose(),
		ctxEsm.dispose(),
		ctxUmdMinified.dispose(),
		ctxEsmMinified.dispose(),
	]);
}
