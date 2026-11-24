<script lang="ts">
	/* An empty state: the drawing is decoration, the caption carries the message. Each panel keeps its own drawing,
	   one small object in ASCII strokes, like the car drawing. A drawing starts and ends with a line break, so a closing backslash
	   never meets the backtick; this cuts them. */
	let { drawing, text }: { drawing: string; text: string } = $props();
</script>

<figure>
	<pre aria-hidden="true">{drawing.slice(1, -1)}</pre>
	<figcaption>{text}</figcaption>
</figure>

<style>
	figure {
		margin: 1.2rem auto;
		font-family: var(--font-data);
		font-size: 0.75rem;
		text-align: center;
		color: var(--mute);
	}

	pre {
		width: fit-content;
		margin: 0 auto 0.5rem;
		font: inherit;
		line-height: 1.15;
		text-align: left;
	}
</style>
