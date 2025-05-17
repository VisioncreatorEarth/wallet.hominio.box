<script lang="ts">
	import type { PermittedAuthMethod } from '$lib/wallet/services/litService';
	import type { Hex } from 'viem';

	// Props
	let { hasHominioWallet, isLoadingWalletDetails, walletDetailsError, permittedAuthMethods } =
		$props<{
			hasHominioWallet: boolean;
			isLoadingWalletDetails: boolean;
			walletDetailsError: string | null;
			permittedAuthMethods: PermittedAuthMethod[] | null;
		}>();

	// Utility functions (moved from +page.svelte)
	function formatAuthMethodType(type: bigint): string {
		switch (type) {
			case 0n:
				return 'EOA Wallet (Implied)';
			case 1n:
				return 'Passkey (via EIP-1271 Verifier)';
			case 2n:
				return 'Lit Action';
			case 3n:
				return 'WebAuthn (Legacy)';
			case 4n:
				return 'WebAuthn Passkey (General)';
			case 5n:
				return 'Discord';
			case 6n:
				return 'Google / EIP-1271 Address';
			case 7n:
				return 'Custom JWT';
			default:
				return `Unknown Type (${type})`;
		}
	}

	function formatIpfsCid(hexId: Hex): string {
		if (
			!hexId ||
			hexId.toLowerCase() === '0x' ||
			hexId.toLowerCase() === '0x0000000000000000000000000000000000000000'
		) {
			return 'N/A (Not an IPFS Action)';
		}
		return hexId;
	}
</script>

<div class="bg-background-surface rounded-xl p-6 shadow-xs">
	<div class="pt-1">
		{#if !hasHominioWallet}
			<p class="text-prussian-blue/70 text-sm">
				Please set up your Wallet to view authorized methods.
			</p>
		{:else if isLoadingWalletDetails}
			<div class="flex items-center justify-start p-4">
				<div class="spinner text-prussian-blue/80 mr-3 h-5 w-5"></div>
				<p class="text-prussian-blue/80 text-sm">Loading authorized methods...</p>
			</div>
		{:else if walletDetailsError}
			<div class="rounded-md bg-red-50 p-3">
				<p class="text-sm text-red-700">
					<span class="font-medium">Error:</span>
					{walletDetailsError}
				</p>
			</div>
		{:else if permittedAuthMethods && permittedAuthMethods.length > 0}
			<ul class="divide-timberwolf-2/30 divide-y">
				{#each permittedAuthMethods as method (method.id + method.authMethodType.toString())}
					<li class="py-3">
						<p class="text-prussian-blue/90 text-sm font-medium">
							Type:
							<span class="text-prussian-blue font-semibold"
								>{formatAuthMethodType(method.authMethodType)}</span
							>
						</p>
						{#if method.authMethodType === 2n}
							<!-- Lit Action -->
							<p class="text-prussian-blue/70 mt-1 text-xs">
								Action IPFS CID (Hex):
								<span class="font-mono break-all">{formatIpfsCid(method.id)}</span>
							</p>
						{:else if method.authMethodType === 1n || method.authMethodType === 4n || method.authMethodType === 6n}
							<!-- Passkey or EOA based -->
							<p class="text-prussian-blue/70 mt-1 text-xs">
								Identifier / User PubKey on Contract (Hex):
								<span class="font-mono break-all">{method.userPubkey || 'N/A'}</span>
							</p>
							{#if method.id !== method.userPubkey && method.id.length > 2}
								<p class="text-prussian-blue/70 mt-1 text-xs">
									Method ID (Hex):
									<span class="font-mono break-all">{method.id}</span>
								</p>
							{/if}
						{:else}
							<!-- Other types -->
							<p class="text-prussian-blue/70 mt-1 text-xs">
								Method ID (Hex):
								<span class="font-mono break-all">{method.id}</span>
							</p>
							{#if method.userPubkey && method.userPubkey.length > 2}
								<p class="text-prussian-blue/70 mt-1 text-xs">
									User PubKey on Contract (Hex):
									<span class="font-mono break-all">{method.userPubkey}</span>
								</p>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-prussian-blue/70 text-sm">
				No permitted authentication methods found for this PKP.
			</p>
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
