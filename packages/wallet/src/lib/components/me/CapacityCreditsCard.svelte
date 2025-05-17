<script lang="ts">
	import type { CapacityCredit } from '$lib/wallet/services/litService';

	// Props
	let { hasHominioWallet, isLoadingWalletDetails, walletDetailsError, ownedCapacityCredits } =
		$props<{
			hasHominioWallet: boolean;
			isLoadingWalletDetails: boolean;
			walletDetailsError: string | null;
			ownedCapacityCredits: CapacityCredit[] | null;
		}>();

	// Utility function (moved from +page.svelte)
	function formatTimestamp(timestamp: bigint): string {
		if (timestamp === 0n || !timestamp) return 'Never / Not Set';
		return new Date(Number(timestamp) * 1000).toLocaleString();
	}
</script>

<div class="bg-background-surface rounded-xl p-6 shadow-xs">
	<div class="pt-1">
		{#if !hasHominioWallet}
			<p class="text-prussian-blue/70 text-sm">
				Please set up your Wallet to view capacity credits.
			</p>
		{:else if isLoadingWalletDetails}
			<div class="flex items-center justify-start p-4">
				<div class="spinner text-prussian-blue/80 mr-3 h-5 w-5"></div>
				<p class="text-prussian-blue/80 text-sm">Loading capacity credits...</p>
			</div>
		{:else if walletDetailsError}
			<div class="rounded-md bg-red-50 p-3">
				<p class="text-sm text-red-700">
					<span class="font-medium">Error:</span>
					{walletDetailsError}
				</p>
			</div>
		{:else if ownedCapacityCredits && ownedCapacityCredits.length > 0}
			<ul class="divide-timberwolf-2/30 divide-y">
				{#each ownedCapacityCredits as credit (credit.tokenId)}
					<li class="py-3">
						<p class="text-prussian-blue/90 text-sm font-medium">
							Token ID:
							<span class="text-prussian-blue font-mono text-xs">{credit.tokenId}</span>
						</p>
						<p class="text-prussian-blue/70 mt-1 text-xs">
							Requests/KiloSec: {credit.requestsPerKilosecond.toString()}
						</p>
						<p class="text-prussian-blue/70 mt-1 text-xs">
							Expires: {formatTimestamp(credit.expiresAt)}
						</p>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-prussian-blue/70 text-sm">No capacity credits found for this PKP.</p>
		{/if}
	</div>
</div>

<style>
	.spinner {
		display: inline-block;
		border: 3px solid currentColor;
		border-right-color: transparent;
		width: 1em;
		height: 1em;
		border-radius: 50%;
		animation: spin 0.75s linear infinite;
		vertical-align: text-bottom;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
