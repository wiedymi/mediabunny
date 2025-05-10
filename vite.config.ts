import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

const examplesDir = path.resolve(__dirname, './examples');

const exampleFolders = fs
	.readdirSync(examplesDir, { withFileTypes: true })
	.filter(dirent => dirent.isDirectory())
	.map(dirent => dirent.name);

const rollupInput = Object.fromEntries(
	exampleFolders.map(folderName => [
		folderName,
		path.resolve(examplesDir, folderName, 'index.html'),
	]),
);

export default defineConfig({
	resolve: {
		alias: {
			mediakit: path.resolve(__dirname, './dist/metamuxer.mjs'),
		},
	},
	build: {
		outDir: 'dist-docs', // Build them directly into the docs build folder
		emptyOutDir: false,
		rollupOptions: {
			input: rollupInput,
		},
		minify: false,
	},
});
