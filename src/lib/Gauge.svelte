<script lang="ts">
	/* A meter drawn in characters, like the car's ASCII ink: # is a full cell, : half a cell, . an empty one. It
	   fills the width it is given, in whole cells. The number printed beside it carries the value for screen readers. */
	let { value }: { value: number } = $props();
</script>

<span class="gauge" aria-hidden="true" style:--v="{value}%"><i>[<b><i></i></b>]</i></span>

<style>
	/* --w (registered in app.css, inherited) eases toward --v, so the cells fill one by one: from empty
	   when the gauge first appears (@starting-style), then on each change.
	   ponytail: needs CSS round() (Chrome 125, Firefox 118, Safari 15.4); without it every gauge reads full. */
	.gauge {
		--w: var(--v, 0%);
		display: block;
		min-width: 0;
		font-family: var(--font-data);
		line-height: 1.2;
		white-space: nowrap;
		color: var(--mute);
		transition: --w 0.7s cubic-bezier(0.33, 1, 0.68, 1);
	}

	@starting-style {
		.gauge {
			--w: 0%;
		}
	}

	.gauge > i {
		display: flex;
		width: round(down, 100%, 1ch);
		font-style: normal;
	}

	/* The track between the brackets. Width 0 keeps the long strings below out of every intrinsic size. */
	b {
		display: flex;
		flex: 1;
		width: 0;
		overflow: hidden;
		font-weight: normal;
	}

	b::before,
	b > i,
	b::after {
		overflow: hidden;
	}

	b::before,
	b > i {
		flex: none;
		color: var(--gauge, var(--live));
	}

	/* Full cells: a share from three quarters of a cell up counts as full. */
	b::before {
		content: '################################################################################';
		width: round(down, var(--w) + 0.25ch, 1ch);
	}

	/* The half cell: one cell wide when the rest is between a quarter and three quarters of a cell, else none. */
	b > i {
		width: calc(round(down, var(--w) + 0.75ch, 1ch) - round(down, var(--w) + 0.25ch, 1ch));
		font-style: normal;
	}

	b > i::before {
		content: ':';
	}

	b::after {
		content: '................................................................................';
		flex: 1;
	}
</style>
