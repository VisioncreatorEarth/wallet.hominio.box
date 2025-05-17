<script lang="ts">
	import type { ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';

	// Props
	let { pkpPasskeyData } = $props<{
		pkpPasskeyData: ClientPkpPasskey | null | undefined;
	}>();

	// Utility function
	function formatKey(key: string): string {
		return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
	}
</script>

{#if pkpPasskeyData}
	<div class="bg-background-surface rounded-xl p-6 shadow-xs">
		<div class="space-y-3 pt-1">
			{#each Object.entries(pkpPasskeyData) as [key, value]}
				<div
					class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-start"
				>
					<span class="text-prussian-blue/80 font-medium">{formatKey(key)}:</span>
					{#if typeof value === 'object' && value !== null}
						<pre
							class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs sm:mt-0 sm:w-auto sm:max-w-md md:max-w-lg"><code
								>{JSON.stringify(value, null, 2)}</code
							></pre>
					{:else}
						<span class="text-prussian-blue text-sm break-all">{String(value ?? 'N/A')}</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
