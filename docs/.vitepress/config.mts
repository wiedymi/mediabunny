import { withMermaid } from 'vitepress-plugin-mermaid';
import footnote from 'markdown-it-footnote';
import tailwindcss from '@tailwindcss/vite';
import llmstxt from 'vitepress-plugin-llms';

// https://vitepress.dev/reference/site-config
export default withMermaid({
	title: 'Mediabunny',
	description: 'A VitePress Site',
	cleanUrls: true,
	head: [
		['link', { rel: 'icon', href: '/mediabunny-logo.svg' }],
	],
	themeConfig: {
		logo: '/mediabunny-logo.svg',

		// https://vitepress.dev/reference/default-theme-config
		nav: [
			{ text: 'Guide', link: '/guide/introduction', activeMatch: '/guide' },
			{ text: 'Examples', link: '/examples', activeMatch: '/examples' },
		],

		sidebar: [
			{
				text: 'Getting started',
				items: [
					{ text: 'Introduction', link: '/guide/introduction' },
					{ text: 'Installation', link: '/guide/installation' },
					{ text: 'Quick start', link: '/guide/quick-start' },
				],
			},
			{
				text: 'Reading',
				items: [
					{ text: 'Reading media files', link: '/guide/reading-media-files' },
					{ text: 'Media sinks', link: '/guide/media-sinks' },
					{ text: 'Input formats', link: '/guide/input-formats' },
				],
			},
			{
				text: 'Writing',
				items: [
					{ text: 'Writing media files', link: '/guide/writing-media-files' },
					{ text: 'Media sources', link: '/guide/media-sources' },
					{ text: 'Output formats', link: '/guide/output-formats' },
				],
			},
			{
				text: 'Conversion',
				items: [
					{ text: 'Converting media files', link: '/guide/converting-media-files' },
				],
			},
			{
				text: 'Miscellaneous',
				items: [
					{ text: 'Packets & samples', link: '/guide/packets-and-samples' },
					{ text: 'Supported formats & codecs', link: '/guide/supported-formats-and-codecs' },
				],
			},
		],

		socialLinks: [
			{ icon: 'github', link: 'https://github.com/Vanilagy/mediabunny' },
		],

		search: {
			provider: 'local',
		},

		outline: {
			level: [2, 3],
		},

		footer: {
			message: 'Released under the Mozilla Public License 2.0.',
			copyright: 'Copyright © 2025-present Vanilagy',
		},
	},
	markdown: {
		math: true,
		theme: { light: 'github-light', dark: 'github-dark-dimmed' },
		config(md) {
			md.use(footnote);
		},
	},
	vite: {
		plugins: [
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			tailwindcss() as any,
			llmstxt(),
		],
	},
	outDir: '../dist-docs',
});
