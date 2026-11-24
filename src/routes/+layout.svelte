<script lang="ts">
	import '../app.css';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icon-192.png" />
	<title>{data.name}</title>
	<meta name="theme-color" media="(prefers-color-scheme: light)" content="#12306b" />
	<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a1730" />
</svelte:head>

{@render children()}
