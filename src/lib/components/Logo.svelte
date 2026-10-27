<script lang="ts">
	/** Orbit: a prompt with an agent circling it. The agent moves unless `still`, or motion is turned off. */
	let { size = 28, still = false }: { size?: number; still?: boolean } = $props();
	// Gradient ids must be unique per instance; the logo appears more than once on some pages.
	const id = $props.id();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" class="shrink-0">
	<defs>
		<linearGradient id="{id}-tile" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#1c2230" />
			<stop offset="1" stop-color="#0f131b" />
		</linearGradient>
		<radialGradient id="{id}-ball" cx="0.35" cy="0.35" r="0.75">
			<stop offset="0" stop-color="#c3d6ff" />
			<stop offset="1" stop-color="#6f9dff" />
		</radialGradient>
	</defs>
	<rect width="32" height="32" rx="8" fill="url(#{id}-tile)" />
	<rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#6f9dff" stroke-opacity="0.25" />
	<circle cx="16" cy="16" r="10" fill="none" stroke="#6f9dff" stroke-opacity="0.45" stroke-width="1.5" />
	<path d="M12.4 12.6 16 16l-3.6 3.4" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
	<path d="M17.6 19.6h3.2" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-opacity="0.8" />
	<g class={still ? '' : 'orbit'}>
		<circle cx="23.07" cy="8.93" r="2.8" fill="url(#{id}-ball)" />
	</g>
</svg>

<style>
	.orbit {
		transform-origin: 16px 16px;
		animation: orbit 9s linear infinite;
	}
	@keyframes orbit {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.orbit {
			animation: none;
		}
	}
</style>
