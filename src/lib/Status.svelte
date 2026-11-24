<script lang="ts">
	import { unset, type Poll } from '#lib/poll.svelte.ts';

	/* A poll's wait or error line: … while it loads, n/c when its keys are missing (the full message in the title). */
	let { p }: { p: Poll<unknown> } = $props();
</script>

<div class="muted" class:err={p.error && !unset(p.error)} title={unset(p.error) ? p.error : undefined}>{p.error ? (unset(p.error) ? 'n/c' : p.error) : '…'}</div>
