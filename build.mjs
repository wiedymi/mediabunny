import * as esbuild from 'esbuild';
import process from 'node:process';

const baseConfig = {
	entryPoints: ['src/index.ts'],
	bundle: true,
	logLevel: 'info',
};

const umdConfig = {
	...baseConfig,
	format: 'iife',

	// The following are hacks to basically make this an UMD module. No native support for that in esbuild as of today
	globalName: 'Mediabunny',

	footer: {
		js:
`if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Mediabunny)`,
	},
};

const esmConfig = {
	...baseConfig,
	format: 'esm',
};

const ctxUmd = await esbuild.context({
	...umdConfig,
	outfile: 'dist/mediabunny.js',
});
const ctxEsm = await esbuild.context({
	...esmConfig,
	outfile: 'dist/mediabunny.mjs',
});
const ctxUmdMinified = await esbuild.context({
	...umdConfig,
	outfile: 'dist/mediabunny.min.js',
	minify: true,
});
const ctxEsmMinified = await esbuild.context({
	...esmConfig,
	outfile: 'dist/mediabunny.min.mjs',
	minify: true,
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
