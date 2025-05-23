import { withMermaid } from 'vitepress-plugin-mermaid';
import footnote from 'markdown-it-footnote';

// https://vitepress.dev/reference/site-config
export default withMermaid({
	title: 'Mediakit',
	description: 'A VitePress Site',
	cleanUrls: true,
	themeConfig: {
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
				],
			},
			{
				text: 'Reading media files',
				items: [
					{ text: 'Reading overview', link: '/guide/reading-overview' },
					{ text: 'Media sinks', link: '/guide/media-sinks' },
					{ text: 'Input formats', link: '/guide/input-formats' },
				],
			},
			{
				text: 'Writing media files',
				items: [
					{ text: 'Writing overview', link: '/guide/writing-overview' },
					{ text: 'Media sources', link: '/guide/media-sources' },
					{ text: 'Output formats', link: '/guide/output-formats' },
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
			{ icon: 'github', link: 'https://github.com/vuejs/vitepress' },
		],

		search: {
			provider: 'local',
		},

		outline: {
			level: [2, 3],
		},
	},
	markdown: {
		math: true,
		config(md) {
			md.use(footnote);
		},
	},
	outDir: '../dist-docs',
});
