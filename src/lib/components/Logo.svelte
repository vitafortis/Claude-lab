<script lang="ts">
	let { size = 28 }: { size?: number } = $props();
	// Gradient ids must be unique per instance; the logo appears more than once on some pages.
	const id = $props.id();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" class="shrink-0">
	<defs>
		<linearGradient id="{id}-ink" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#1c2230" />
			<stop offset="1" stop-color="#0f131b" />
		</linearGradient>
	</defs>
	<rect width="32" height="32" rx="8" fill="url(#{id}-ink)" />
	<!-- Orbit: a prompt with an agent circling it, working while you're away. -->
	<circle cx="16" cy="16" r="10" fill="none" stroke="#6f9dff" stroke-opacity="0.5" stroke-width="1.6" />
	<circle cx="23.1" cy="8.9" r="2.8" fill="#8fb4ff" />
	<path d="M12.4 12.6 16 16l-3.6 3.4" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />
	<path d="M17.6 19.6h3.2" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-opacity="0.8" />
</svg>
