<script lang="ts">
	import {
		createPublicClient,
		createWalletClient,
		http,
		custom,
		type PublicClient,
		type WalletClient
	} from 'viem';
	import { gnosis } from 'viem/chains';
	import { onDestroy, onMount } from 'svelte';
	import {
		chainNameStore,
		viemPublicClientStore,
		viemWalletClientStore,
		connectedAccountStore,
		walletConnectionErrorStore
	} from '$lib/stores/walletStore';

	let publicClientInstance: PublicClient;

	async function connectMetaMask() {
		$walletConnectionErrorStore = null;
		if (typeof window.ethereum !== 'undefined') {
			try {
				const client = createWalletClient({
					chain: gnosis,
					transport: custom(window.ethereum)
				});
				const [address] = await client.requestAddresses();
				$connectedAccountStore = address;
				$viemWalletClientStore = client as WalletClient; // Cast to ensure store type matches
			} catch (err: any) {
				console.error('Wallet connection error:', err);
				$walletConnectionErrorStore =
					err.shortMessage || err.message || 'Failed to connect wallet.';
				$connectedAccountStore = null;
				$viemWalletClientStore = null;
			}
		} else {
			$walletConnectionErrorStore = 'MetaMask not detected. Please install MetaMask.';
		}
	}

	function disconnectMetaMask() {
		$connectedAccountStore = null;
		$viemWalletClientStore = null;
		$walletConnectionErrorStore = null;
	}

	onMount(() => {
		publicClientInstance = createPublicClient({
			chain: gnosis,
			transport: http()
		});
		$viemPublicClientStore = publicClientInstance;
		$chainNameStore = gnosis.name;
	});

	onDestroy(() => {
		$chainNameStore = null;
		$viemPublicClientStore = null;
		// Clear wallet-specific stores if the user navigates away from /me section
		// or if a disconnect happens, which is handled by disconnectMetaMask too.
		disconnectMetaMask();
	});
</script>

<div class="p-4 pt-2">
	<div class="mb-4 flex items-center space-x-3">
		{#if $connectedAccountStore}
			<div class="flex items-center space-x-2">
				<span class="rounded-md bg-green-100 px-2 py-1 font-mono text-xs text-green-700">
					{`${$connectedAccountStore.slice(0, 6)}...${$connectedAccountStore.slice(-4)}`}
				</span>
				<button
					onclick={disconnectMetaMask}
					class="rounded bg-red-500 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600"
					title="Disconnect Wallet"
				>
					Disconnect
				</button>
			</div>
		{:else}
			<button
				onclick={connectMetaMask}
				class="rounded bg-[#A0522D] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#8B4513]"
			>
				Connect MetaMask (Gnosis)
			</button>
		{/if}
	</div>
	{#if $walletConnectionErrorStore && !$connectedAccountStore}
		<p class="mb-4 rounded-md bg-red-100 p-2 text-xs text-red-500">
			Error: {$walletConnectionErrorStore}
		</p>
	{/if}

	<slot />
</div>
