<script lang="ts">
	import {
		createPublicClient,
		// createWalletClient, // Not needed directly in this layout anymore for EOA connection
		http,
		// custom, // Not needed directly in this layout anymore for EOA connection
		type PublicClient
		// type WalletClient // Not needed directly in this layout anymore for EOA connection
	} from 'viem';
	import { gnosis } from 'viem/chains';
	import { onDestroy, onMount, setContext } from 'svelte';
	import { writable, type Writable } from 'svelte/store';
	import {
		chainNameStore,
		viemPublicClientStore
		// viemWalletClientStore, // Managed by +page.svelte
		// connectedAccountStore,  // Managed by +page.svelte
		// walletConnectionErrorStore // Managed by +page.svelte
	} from '$lib/stores/walletStore';

	import { initializeLitClient } from '$lib/wallet/lit-connect';
	import type { LitNodeClient } from '@lit-protocol/lit-node-client';

	// ADDED: For Navbar - from root layout
	import { authClient } from '$lib/client/betterauth-client';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';

	let publicClientInstance: PublicClient;
	const litClientStore: Writable<LitNodeClient | null> = writable(null);

	// ADDED: For Navbar - session and signout logic from root layout
	const session = authClient.useSession();
	let signOutLoading = $state(false);

	async function handleSignOut() {
		if (!browser) return;
		signOutLoading = true;
		try {
			await authClient.signOut();
			console.log('[ME Layout] User signed out, redirecting to /');
			goto('/', { replaceState: true });
		} catch (e: any) {
			console.error('[ME Layout] Sign out error:', e);
		} finally {
			signOutLoading = false;
		}
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
			litClientStore.set(client);
			console.log('[ME Layout] Lit Client initialized and store updated.');
		} catch (err) {
			console.error('[ME Layout] Failed to initialize Lit Client:', err);
			litClientStore.set(null);
		}
	});

	onDestroy(async () => {
		$chainNameStore = null;
		$viemPublicClientStore = null;

		const client = $litClientStore;
		if (client && client.ready) {
			try {
				await client.disconnect();
				console.log('[ME Layout] Disconnected from Lit Network.');
			} catch (error) {
				console.error('[ME Layout] Error disconnecting from Lit Network:', error);
			}
		}
		litClientStore.set(null);
	});
</script>

<div class="h-full p-4 pt-2">
	{#if $session.data?.user}
		<header class="bg-linen mb-4 w-full p-4 shadow-md">
			<nav class="container mx-auto flex items-center justify-between">
				<a
					href="/"
					class="font-playfair-display text-prussian-blue hover:text-persian-orange text-2xl font-bold"
				>
					Hominio Wallet
				</a>
				<div class="flex items-center space-x-4">
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

					<span class="text-prussian-blue/90 text-sm">
						{$session.data.user.email || $session.data.user.name || 'User'}
					</span>
					{#if typeof window !== 'undefined' && window.location.pathname !== '/me'}
						<a
							href="/me"
							class="text-prussian-blue hover:bg-timberwolf-1/50 hover:text-persian-orange rounded-md px-3 py-2 text-sm font-medium"
						>
							Profile
						</a>
					{/if}
					<button
						onclick={handleSignOut}
						disabled={signOutLoading}
						class="focus:ring-opacity-60 flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:outline-none disabled:opacity-50"
						title="Sign out"
					>
						{#if signOutLoading}
							<svg
								class="h-5 w-5 animate-spin"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
								/>
							</svg>
						{/if}
					</button>
				</div>
			</nav>
		</header>
	{/if}
	<div class="h-full">
		<slot />
	</div>
</div>
