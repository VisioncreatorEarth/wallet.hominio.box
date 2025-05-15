<script lang="ts">
	let { children } = $props();

	import {
		createPublicClient,
		// createWalletClient, // Not needed directly in this layout anymore for EOA connection
		http,
		// custom, // Not needed directly in this layout anymore for EOA connection
		type PublicClient,
		type Hex,
		type Address
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
	import { disconnectWeb3 } from '@lit-protocol/auth-browser'; // Import disconnectWeb3

	// ADDED: For Navbar - from root layout
	import { authClient } from '$lib/client/betterauth-client';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';

	// ADDED: Imports for Sign Message Modal
	import SignMessage from '$lib/components/SignMessage.svelte';
	import { signMessageWithPkp } from '$lib/wallet/services/litSigningService';
	import type { ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';

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

	// ADDED: State for Sign Message Modal
	let isSignMessageModalOpen = $state(false);
	let isSigningMessage = $state(false);
	let messageSignature = $state<Hex | null>(null);
	let messageSigningError = $state<string | null>(null);

	// ADDED: Derived data for PKP Passkey and wallet status
	let currentPkpData = $derived(
		$session.data?.user?.pkp_passkey && typeof $session.data.user.pkp_passkey === 'object'
			? ($session.data.user.pkp_passkey as ClientPkpPasskey)
			: null
	);
	let hasHominioWallet = $derived(!!currentPkpData?.pkpEthAddress);

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

	// ADDED: Handlers for SignMessage component events
	async function handleSignRequest(event: CustomEvent<string>) {
		const messageToSign = event.detail;
		isSigningMessage = true;
		messageSignature = null;
		messageSigningError = null;

		if (
			!currentPkpData?.pkpTokenId ||
			!currentPkpData?.pubKey ||
			!currentPkpData.rawId ||
			!currentPkpData.passkeyVerifierContract
		) {
			messageSigningError =
				'PKP details (Token ID, Public Key) or Passkey information not found in session. Cannot sign.';
			isSigningMessage = false;
			return;
		}

		const result = await signMessageWithPkp(
			messageToSign,
			currentPkpData.pkpTokenId,
			currentPkpData.pubKey as Hex,
			currentPkpData.rawId as Hex,
			currentPkpData.passkeyVerifierContract as Address
		);

		if ('signature' in result) {
			messageSignature = result.signature;
		} else {
			messageSigningError = result.error;
		}
		isSigningMessage = false;
	}

	function handleClearSignature() {
		messageSignature = null;
		messageSigningError = null;
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
				console.log(
					'[ME Layout] Attempting to disconnect from Lit Network and clear session keys...'
				);
				disconnectWeb3(); // Attempt to clear browser session keypair from localStorage via SDK
				console.log('[ME Layout] disconnectWeb3() called.');
				await client.disconnect(); // Disconnect from the Lit network nodes
				console.log('[ME Layout] LitNodeClient disconnected from network nodes.');
			} catch (error) {
				console.error('[ME Layout] Error during Lit Protocol SDK disconnection/cleanup:', error);
			} finally {
				// Manual cleanup as a fallback or to ensure thoroughness
				if (browser) {
					// Ensure localStorage is only accessed in the browser
					try {
						console.log('[ME Layout] Manually removing Lit Protocol keys from localStorage...');
						localStorage.removeItem('lit-session-key');
						localStorage.removeItem('lit-wallet-sig');
						console.log('[ME Layout] Manually removed lit-session-key and lit-wallet-sig.');
					} catch (e) {
						console.error('[ME Layout] Error manually removing Lit keys from localStorage:', e);
					}
				}
			}
		}

		// Also ensure manual cleanup happens if client wasn't ready or didn't exist, but we are destroying
		if (browser) {
			// Check if keys exist before trying to remove, to avoid unnecessary logs if already cleared
			if (localStorage.getItem('lit-session-key') || localStorage.getItem('lit-wallet-sig')) {
				console.log(
					'[ME Layout] Ensuring Lit Protocol keys are removed from localStorage (outside client.ready check).'
				);
				try {
					localStorage.removeItem('lit-session-key');
					localStorage.removeItem('lit-wallet-sig');
					console.log(
						'[ME Layout] Successfully ensured removal of lit-session-key and lit-wallet-sig.'
					);
				} catch (e) {
					console.error(
						'[ME Layout] Error during final manual removal of Lit keys from localStorage:',
						e
					);
				}
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
	<div class="bg-background-app relative flex-grow overflow-hidden">
		{@render children()}

		<!-- ADDED: Modal Trigger Button -->
		{#if $session.data?.user && hasHominioWallet}
			<button
				onclick={() => {
					isSignMessageModalOpen = true;
					// Clear previous results when opening modal
					messageSignature = null;
					messageSigningError = null;
				}}
				class="focus:ring-persian-orange bg-persian-orange fixed bottom-6 left-1/2 z-50 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full p-3 text-white shadow-lg transition-transform hover:scale-105 focus:ring-2 focus:outline-none"
				title="Sign Message"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
					/>
				</svg>
			</button>
		{/if}

		<!-- ADDED: Sign Message Modal -->
		{#if isSignMessageModalOpen && currentPkpData}
			<div
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
				onclick={(event) => {
					if (event.target === event.currentTarget) {
						isSignMessageModalOpen = false;
					}
				}}
			>
				<div class="bg-background-surface w-full max-w-lg rounded-xl p-6 shadow-2xl">
					<div class="mb-4 flex items-center justify-between">
						<h3 class="text-prussian-blue text-xl font-semibold">Sign a Message</h3>
						<button
							onclick={() => (isSignMessageModalOpen = false)}
							class="text-prussian-blue/70 hover:text-prussian-blue rounded-full p-1 text-2xl leading-none focus:outline-none"
							aria-label="Close modal"
						>
							&times;
						</button>
					</div>
					<SignMessage
						pkpPublicKey={currentPkpData.pubKey as Hex}
						passkeyRawId={currentPkpData.rawId as Hex}
						passkeyVerifierContractAddress={currentPkpData.passkeyVerifierContract as Address}
						isSigningProcessActive={isSigningMessage}
						signatureResult={messageSignature}
						signingErrorDetail={messageSigningError}
						on:sign={handleSignRequest}
						on:clear={handleClearSignature}
					/>
				</div>
			</div>
		{/if}
	</div>
	{#if !$session.data?.user}
		<div class="py-16 text-center">
			<h1 class="font-playfair-display text-prussian-blue mb-6 text-4xl font-normal md:text-5xl">
				Access Denied
			</h1>
			<p class="text-prussian-blue/80 text-xl">You need to be signed in to view this page.</p>
			<p class="mt-10">
				<a
					href="/"
					class="font-ibm-plex-sans bg-prussian-blue text-linen focus:ring-persian-orange focus:ring-opacity-50 inline-block rounded-full px-10 py-3 text-lg font-bold shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus:ring-2 focus:outline-none"
				>
					Go to Homepage
				</a>
			</p>
		</div>
	{/if}
</div>
