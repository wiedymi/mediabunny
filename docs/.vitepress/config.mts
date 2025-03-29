import { defineConfig } from 'vitepress';
import footnote from 'markdown-it-footnote';

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: 'Mediakit',
	description: 'A VitePress Site',
	cleanUrls: true,
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		nav: [
			{ text: 'Home', link: '/' },
			{ text: 'Guide', link: '/guide/introduction' },
		],

		sidebar: [
			{
				text: 'Getting started',
				items: [
					{ text: 'Introduction', link: '/guide/introduction' },
				],
			},
			{
				text: 'Reading media files',
				items: [
					{ text: 'Reading basics', link: '/guide/reading' },
					{ text: 'Media sinks', link: '/guide/media-sinks' },
					{ text: 'Input formats', link: '/guide/input-formats' },
				],
			},
			{
				text: 'Writing media files',
				items: [
					{ text: 'Writing basics', link: '/guide/writing' },
					{ text: 'Media sources', link: '/guide/media-sources' },
					{ text: 'Output formats', link: '/guide/output-formats' },
				],
			},
			{
				text: 'Miscellaneous',
				items: [
					{ text: 'Supported formats & codecs', link: 'guide/supported-formats-and-codecs' },
					{ text: 'Custom coders', link: 'guide/custom-coders' },
				],
			},
		],

		socialLinks: [
			{ icon: 'github', link: 'https://github.com/vuejs/vitepress' },
		],
	},
	markdown: {
		config(md) {
			md.use(footnote);
		},
	},
});
