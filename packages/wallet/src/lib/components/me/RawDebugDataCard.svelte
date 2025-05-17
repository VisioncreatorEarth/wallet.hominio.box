<script lang="ts">
	// Props
	let { allData } = $props<{
		allData: any; // This is $session.data, so can be typed more specifically if a type for session.data exists
	}>();
</script>

{#if allData}
	<div class="bg-background-surface rounded-xl p-6 shadow-xs">
		<div class="bg-prussian-blue overflow-auto rounded-lg p-4 pt-1 text-left shadow-inner">
			<pre class="text-linen text-xs">{JSON.stringify(allData, null, 2)}</pre>
		</div>
	</div>
{/if}
