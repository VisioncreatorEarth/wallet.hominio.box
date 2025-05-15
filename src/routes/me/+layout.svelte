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

	// Store for mobile menu state (isOpen, activeLabel)
	const mobileMenuContextKey = 'mobileMenu';
	const mobileMenuStore = writable({
		isOpen: false,
		activeLabel: 'User Details' // Default label, page will update it
	});
	setContext(mobileMenuContextKey, mobileMenuStore);

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

<div class="flex h-full flex-col">
	{#if $session.data?.user}
		<header
			class="bg-background-header z-40 mb-0 flex h-16 w-full flex-shrink-0 items-center shadow-md md:mb-4"
		>
			<nav class="container mx-auto flex h-full w-full items-center justify-between px-4">
				<div class="flex items-center">
					<!-- Hamburger Button for Mobile -->
					<button
						onclick={() => mobileMenuStore.update((s) => ({ ...s, isOpen: !s.isOpen }))}
						class="text-prussian-blue hover:bg-timberwolf-1/50 focus:ring-persian-orange mr-2 rounded-md p-2 focus:ring-2 focus:outline-none md:hidden"
						aria-label="Toggle navigation menu"
					>
						{#if $mobileMenuStore.isOpen}
							<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						{:else}
							<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 6h16M4 12h16m-7 6h7"
								/>
							</svg>
						{/if}
					</button>
					<a
						href="/"
						class="font-playfair-display text-prussian-blue hover:text-persian-orange flex items-center text-xl font-bold md:text-2xl"
					>
						<img src="/logo.svg" alt="Hominio Logo" class="mr-2 h-8 w-8" />
						Wallet
					</a>
				</div>

				<div class="flex items-center space-x-2 sm:space-x-3">
					<!-- Lit Connection Status UI Removed -->
					<span class="text-prussian-blue/90 hidden text-sm sm:inline-block">
						{$session.data.user.email || $session.data.user.name || 'User'}
					</span>
					{#if typeof window !== 'undefined' && window.location.pathname !== '/me'}
						<a
							href="/me"
							class="text-prussian-blue hover:bg-timberwolf-1/50 hover:text-persian-orange hidden rounded-md px-3 py-2 text-sm font-medium sm:inline-block"
						>
							Profile
						</a>
					{/if}
					<button
						onclick={handleSignOut}
						disabled={signOutLoading}
						class="focus:ring-opacity-60 bg-persian-orange flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:outline-none disabled:opacity-50"
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
	<div class="bg-background-app flex-grow overflow-hidden">
		<slot />
	</div>
</div>
