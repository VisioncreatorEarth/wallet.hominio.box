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
	import { onDestroy, onMount, setContext } from 'svelte';
	import { writable, type Writable } from 'svelte/store';
	import {
		chainNameStore,
		viemPublicClientStore,
		viemWalletClientStore,
		connectedAccountStore,
		walletConnectionErrorStore
	} from '$lib/stores/walletStore';

	import { initializeLitClient } from '$lib/wallet/lit-connect';
	import type { LitNodeClient } from '@lit-protocol/lit-node-client';

	let publicClientInstance: PublicClient;
	const litClientStore: Writable<LitNodeClient | null> = writable(null);

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

	onMount(async () => {
		publicClientInstance = createPublicClient({
			chain: gnosis,
			transport: http()
		});
		$viemPublicClientStore = publicClientInstance;
		$chainNameStore = gnosis.name;

		// Set the store in context synchronously
		setContext('litClientStore', litClientStore);

		// Initialize Lit Client Asynchronously and update the store
		try {
			console.log('[ME Layout] Initializing Lit Client...');
			const client = await initializeLitClient();
			litClientStore.set(client); // Update the store with the initialized client
			console.log('[ME Layout] Lit Client initialized and store updated.');
		} catch (err) {
			console.error('[ME Layout] Failed to initialize Lit Client:', err);
			litClientStore.set(null); // Ensure store is null on error
			// Optionally, set an error state or notify the user
		}
	});

	onDestroy(async () => {
		$chainNameStore = null;
		$viemPublicClientStore = null;
		disconnectMetaMask();

		// Disconnect Lit Client from store
		const client = $litClientStore; // Get client from store
		if (client && client.ready) {
			try {
				await client.disconnect();
				console.log('[ME Layout] Disconnected from Lit Network.');
			} catch (error) {
				console.error('[ME Layout] Error disconnecting from Lit Network:', error);
			}
		}
		litClientStore.set(null); // Reset store on destroy
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

		<!-- Lit Protocol Connection Status -->
		{#if $litClientStore && $litClientStore.ready}
			<span class="rounded-md bg-blue-100 px-2 py-1 font-mono text-xs text-blue-700">
				Lit Connected
			</span>
		{:else if $litClientStore && !$litClientStore.ready}
			<span class="rounded-md bg-yellow-100 px-2 py-1 font-mono text-xs text-yellow-700">
				Lit Connecting...
			</span>
		{:else}
			<span class="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
				Lit Not Connected
			</span>
		{/if}
	</div>
	{#if $walletConnectionErrorStore && !$connectedAccountStore}
		<p class="mb-4 rounded-md bg-red-100 p-2 text-xs text-red-500">
			Error: {$walletConnectionErrorStore}
		</p>
	{/if}

	<slot />
</div>
