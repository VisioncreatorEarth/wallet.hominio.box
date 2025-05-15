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

	// UPDATED: Imports for generalized Action Modal
	import Signer from '$lib/components/Signer.svelte'; // Renamed from SignMessage.svelte
	import {
		signMessageWithPkp,
		executeLitActionWithPkp
	} from '$lib/wallet/services/litSigningService';
	import type { ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';
	import type {
		RequestActionDetail,
		ExecuteEventDetail,
		SimplifiedSignMessageUiParams,
		SimplifiedExecuteLitActionUiParams,
		ActionResultDetail,
		SignMessageResultDetail,
		ExecuteLitActionResultDetail
	} from '$lib/wallet/actionTypes';
	import { example42LitActionCode } from '$lib/wallet/lit-actions/example-42';
	import type { ExecuteJsResponse } from '@lit-protocol/types';
	import Modal from '$lib/components/Modal.svelte'; // ADDED: Import new Modal component

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

	// UPDATED: State for generalized Action Modal
	let isActionModalOpen = $state(false);
	let isProcessingAction = $state(false);
	let currentActionRequest = $state<RequestActionDetail | null>(null);
	// Combined result state: can hold signature (Hex) or ExecuteJsResponse
	let actionPrimaryResult = $state<Hex | ExecuteJsResponse | null>(null);
	let actionErrorDetail = $state<string | null>(null);

	// REPLACED $derived with writable store
	const currentProcessResultStore: Writable<ActionResultDetail | null> = writable(null);

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

	// UPDATED: Handler for ActionComponent execute event
	async function handleActionExecuteRequest(eventDetail: ExecuteEventDetail) {
		if (!currentPkpData) {
			console.error('PKP data not available to execute action.');
			actionErrorDetail = 'PKP data not available.';
			isActionModalOpen = false;
			return;
		}
		isProcessingAction = true;
		actionPrimaryResult = null;
		actionErrorDetail = null;

		const {
			pubKey: pkpPublicKey,
			rawId: passkeyRawIdFromPkp,
			passkeyVerifierContract: passkeyVerifierContractAddress,
			pkpTokenId
		} = currentPkpData;

		if (!pkpPublicKey || !passkeyRawIdFromPkp || !passkeyVerifierContractAddress || !pkpTokenId) {
			console.error('Essential PKP details missing from currentPkpData:', currentPkpData);
			actionErrorDetail = 'Essential PKP details are missing from session.';
			isProcessingAction = false;
			return;
		}

		// Ensure passkeyRawId is in the correct Hex format and explicitly typed
		const pkpRawIdInternal: string = passkeyRawIdFromPkp;
		const formattedPasskeyRawId: Hex = pkpRawIdInternal.startsWith('0x')
			? (pkpRawIdInternal as Hex)
			: (`0x${pkpRawIdInternal}` as Hex);

		try {
			if (eventDetail.type === 'signMessage') {
				const uiParams = eventDetail.uiParams as SimplifiedSignMessageUiParams;
				const result = await signMessageWithPkp(
					uiParams.messageToSign,
					pkpTokenId,
					pkpPublicKey as Hex,
					formattedPasskeyRawId,
					passkeyVerifierContractAddress as Address
				);
				if (result && 'signature' in result && result.signature) {
					actionPrimaryResult = result.signature;
					actionErrorDetail = null;
					console.log(
						'[Layout] signMessage success, actionPrimaryResult:',
						actionPrimaryResult,
						'currentActionRequest:',
						$state.snapshot(currentActionRequest)
					);
				} else if (result && 'error' in result && result.error) {
					actionErrorDetail = result.error;
					actionPrimaryResult = null;
					console.log(
						'[Layout] signMessage error, actionErrorDetail:',
						actionErrorDetail,
						'currentActionRequest:',
						$state.snapshot(currentActionRequest)
					);
				} else {
					actionErrorDetail = 'Unexpected result from signMessageWithPkp';
					console.log(
						'[Layout] signMessage unexpected result',
						'currentActionRequest:',
						$state.snapshot(currentActionRequest)
					);
				}
			} else if (eventDetail.type === 'executeLitAction') {
				const uiParams = eventDetail.uiParams as SimplifiedExecuteLitActionUiParams;
				const result = await executeLitActionWithPkp(
					pkpTokenId,
					pkpPublicKey as Hex,
					formattedPasskeyRawId,
					passkeyVerifierContractAddress as Address,
					uiParams.litActionCode,
					uiParams.jsParams
				);
				if (result && 'error' in result && typeof result.error === 'string') {
					actionErrorDetail = result.error;
					actionPrimaryResult = null;
					console.log(
						'[Layout] executeLitAction error, actionErrorDetail:',
						actionErrorDetail,
						'currentActionRequest:',
						$state.snapshot(currentActionRequest)
					);
				} else if (result && ('response' in result || 'logs' in result)) {
					actionPrimaryResult = result as ExecuteJsResponse;
					actionErrorDetail = null;
					console.log(
						'[Layout] executeLitAction success, actionPrimaryResult:',
						actionPrimaryResult,
						'currentActionRequest:',
						$state.snapshot(currentActionRequest)
					);
				} else {
					actionErrorDetail = 'Unexpected result structure from executeLitActionWithPkp';
					actionPrimaryResult = null;
					console.log(
						'[Layout] executeLitAction unexpected result or error structure',
						'result:',
						result,
						'currentActionRequest:',
						$state.snapshot(currentActionRequest)
					);
				}
			}
		} catch (e: any) {
			console.error('Error processing action:', e);
			actionErrorDetail = e.message || 'An unexpected error occurred.';
		} finally {
			isProcessingAction = false;

			// Manually compute and set the result store here
			let resultToStore: ActionResultDetail | null = null;
			const currentActionReqSnapshot = $state.snapshot(currentActionRequest);

			if (actionErrorDetail) {
				if (currentActionReqSnapshot?.type === 'signMessage') {
					resultToStore = { type: 'signMessage', error: actionErrorDetail };
				} else if (currentActionReqSnapshot?.type === 'executeLitAction') {
					resultToStore = { type: 'executeLitAction', error: actionErrorDetail };
				}
				console.log(
					'[Layout finally] Computed result for store (error case):',
					$state.snapshot(resultToStore)
				);
			} else if (actionPrimaryResult) {
				if (
					currentActionReqSnapshot?.type === 'signMessage' &&
					typeof actionPrimaryResult === 'string'
				) {
					resultToStore = { type: 'signMessage', signature: actionPrimaryResult };
				} else if (
					currentActionReqSnapshot?.type === 'executeLitAction' &&
					typeof actionPrimaryResult === 'object' &&
					actionPrimaryResult !== null
				) {
					resultToStore = {
						type: 'executeLitAction',
						result: actionPrimaryResult as ExecuteJsResponse
					};
				}
				console.log(
					'[Layout finally] Computed result for store (success case):',
					$state.snapshot(resultToStore)
				);
			} else {
				console.log('[Layout finally] Computed result for store (no error/result case): null');
			}
			currentProcessResultStore.set(resultToStore);
			console.log(
				'[Layout finally] currentProcessResultStore set to:',
				$state.snapshot(resultToStore)
			);
		}
	}

	function handleClearActionResult() {
		actionPrimaryResult = null;
		actionErrorDetail = null;
		currentActionRequest = null;
		currentProcessResultStore.set(null); // Also clear the store
		console.log('[Layout] handleClearActionResult: currentProcessResultStore set to null');
	}

	function openSignMessageModal() {
		if (!currentPkpData) return;
		currentActionRequest = {
			type: 'signMessage',
			params: {
				messageToSign: 'Hello from Hominio Wallet! Sign this.',
				pkpPublicKey: currentPkpData.pubKey as Hex,
				passkeyRawId: currentPkpData.rawId as Hex,
				passkeyVerifierContractAddress: currentPkpData.passkeyVerifierContract as Address,
				pkpTokenId: currentPkpData.pkpTokenId
			}
		};
		actionPrimaryResult = null;
		actionErrorDetail = null;
		isActionModalOpen = true;
	}

	function openExecute42ActionModal() {
		if (!currentPkpData) return;
		currentActionRequest = {
			type: 'executeLitAction',
			params: {
				litActionCode: example42LitActionCode,
				jsParams: { magicNumber: Math.floor(Math.random() * 100) },
				pkpPublicKey: currentPkpData.pubKey as Hex,
				passkeyRawId: currentPkpData.rawId as Hex,
				passkeyVerifierContractAddress: currentPkpData.passkeyVerifierContract as Address,
				pkpTokenId: currentPkpData.pkpTokenId
			}
		};
		actionPrimaryResult = null;
		actionErrorDetail = null;
		isActionModalOpen = true;
	}

	// MOVED HERE: Expose functions to control the action modal (must be at top level)
	setContext('openSignMessageModal', openSignMessageModal);
	setContext('openExecute42ActionModal', openExecute42ActionModal);

	onMount(async () => {
		publicClientInstance = createPublicClient({
			chain: gnosis,
			transport: http()
		});
		$viemPublicClientStore = publicClientInstance;
		$chainNameStore = gnosis.name;

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
						class=" text-prussian-blue hover:text-persian-orange flex items-center text-xl font-bold md:text-3xl"
					>
						<img src="/logo.svg" alt="Hominio Logo" class="mr-2 h-8 w-8" />
						Wallet
					</a>
				</div>

				<div class="flex items-center space-x-2 sm:space-x-3">
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

		<!-- UPDATED: Generalized Action Modal -->
		{#if isActionModalOpen && currentPkpData && currentActionRequest}
			<Modal
				isOpen={isActionModalOpen}
				onClose={() => {
					isActionModalOpen = false;
					handleClearActionResult();
				}}
				title={currentActionRequest.type === 'signMessage'
					? 'Sign a Message'
					: 'Execute Lit Action'}
			>
				<Signer
					actionRequest={currentActionRequest}
					isProcessing={isProcessingAction}
					processResult={$currentProcessResultStore}
					onClose={handleClearActionResult}
					onExecute={handleActionExecuteRequest}
				/>
			</Modal>
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
