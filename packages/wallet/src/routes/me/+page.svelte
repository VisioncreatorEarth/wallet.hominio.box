<script lang="ts">
	import { authClient } from '$lib/client/betterauth-client';
	import {
		createNewPasskeyWallet,
		type WalletSetupState
	} from '$lib/wallet/services/walletSetupOrchestrationService';
	import {
		getPermittedAuthMethodsForPkp,
		getOwnedCapacityCredits,
		type PermittedAuthMethod,
		type CapacityCredit
	} from '$lib/wallet/services/litService';
	import {
		viemWalletClientStore,
		connectedAccountStore,
		walletConnectionErrorStore
	} from '$lib/stores/walletStore';
	import { createWalletClient, custom, type WalletClient, type Address, type Hex } from 'viem';
	import { gnosis } from 'viem/chains';
	import type { ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';
	import { browser } from '$app/environment';
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import { goto } from '$app/navigation';

	// NEW: Import SignMessage component and signing service
	// import SignMessage from '$lib/components/SignMessage.svelte';
	// import { signMessageWithPkp } from '$lib/wallet/services/litSigningService';

	// Get modal control functions from context
	const openSignMessageModalFromLayout =
		getContext<(message?: string) => void>('openSignMessageModal');
	const openExecuteLitActionModalFromLayout = getContext<
		(cid?: string, jsParams?: Record<string, unknown>) => void
	>('openExecuteLitActionModal');

	interface MobileMenuStore {
		isOpen: boolean;
		activeLabel: string;
	}

	const mobileMenuContextKey = 'mobileMenu';
	const mobileMenuStore = getContext<Writable<MobileMenuStore>>(mobileMenuContextKey);

	const session = authClient.useSession();
	let activeTab = $state('userDetails');

	const tabs = [
		{ id: 'userDetails', label: 'User Details' },
		{ id: 'sessionInfo', label: 'Session Information' },
		{ id: 'passkeyDetails', label: 'Passkey Details' },
		{ id: 'walletManagement', label: 'Hominio Wallet' },
		{ id: 'authMethods', label: 'Authorized Methods' },
		{ id: 'capacityCredits', label: 'Capacity Credits' },
		{ id: 'testSigner', label: 'Test Signer' },
		{ id: 'rawDebug', label: 'Raw Debug Data' }
	];

	function formatKey(key: string): string {
		return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
	}

	// Wallet Creation State
	let walletFlowState = $state<WalletSetupState | null>(null);
	let isWalletCreating = $state(false);
	let newPkpEthAddress = $state<Address | null>(null);
	let walletCreationError = $state<string | null>(null);

	// Reactive EOA wallet stores
	let eoaWalletClient = $state<WalletClient | null>(null);
	let eoaAccountAddress = $state<Address | null>(null);

	// EOA Connection error store (shadows the imported store for local usage in template)
	let eoaConnectionError = $state<string | null>(null);

	// State for wallet details (capacity credits and auth methods)
	let ownedCapacityCredits = $state<CapacityCredit[] | null>(null);
	let permittedAuthMethods = $state<PermittedAuthMethod[] | null>(null);
	let isLoadingWalletDetails = $state(false);
	let walletDetailsError = $state<string | null>(null);

	// State for dynamic inputs for Test Signer
	let customMessageText = $state('');
	let customLitActionCidText = $state('local:example-42.js'); // Default to example CID
	let customJsParamsText = $state(JSON.stringify({ magicNumber: 42 }, null, 2));

	const jsParamsPlaceholderString = '{"key": "value"}';

	$effect(() => {
		eoaWalletClient = $viemWalletClientStore;
		eoaAccountAddress = $connectedAccountStore as Address | null;
		eoaConnectionError = $walletConnectionErrorStore;
	});

	let currentPkpData = $derived(
		$session.data?.user?.pkp_passkey && typeof $session.data.user.pkp_passkey === 'object'
			? ($session.data.user.pkp_passkey as ClientPkpPasskey)
			: null
	);

	let hasHominioWallet = $derived(!!currentPkpData?.pkpEthAddress);

	$effect(() => {
		async function fetchDetails() {
			if (browser && currentPkpData?.pkpEthAddress && currentPkpData?.pkpTokenId) {
				isLoadingWalletDetails = true;
				walletDetailsError = null;
				ownedCapacityCredits = null;
				permittedAuthMethods = null;
				console.log(
					`[MePage] Fetching wallet details for PKP ETH: ${currentPkpData.pkpEthAddress}, Token ID: ${currentPkpData.pkpTokenId}`
				);
				try {
					const [credits, methods] = await Promise.all([
						getOwnedCapacityCredits(currentPkpData.pkpEthAddress as Address),
						getPermittedAuthMethodsForPkp(currentPkpData.pkpTokenId)
					]);
					ownedCapacityCredits = credits;
					permittedAuthMethods = methods;
					console.log('[MePage] Fetched Capacity Credits:', credits);
					console.log('[MePage] Fetched Permitted Auth Methods:', methods);
				} catch (err: any) {
					console.error('[MePage] Error fetching wallet details:', err);
					walletDetailsError = `Failed to fetch wallet details: ${err.message || 'Unknown error'}`;
				} finally {
					isLoadingWalletDetails = false;
				}
			} else {
				ownedCapacityCredits = null;
				permittedAuthMethods = null;
			}
		}
		fetchDetails();
	});

	// REMOVED: Handlers for SignMessage component events (handleSignRequest, handleClearSignature)

	async function connectMetaMask() {
		walletConnectionErrorStore.set(null);
		eoaConnectionError = null;
		if (typeof window.ethereum !== 'undefined') {
			try {
				const client = createWalletClient({
					chain: gnosis,
					transport: custom(window.ethereum)
				});
				const [address] = await client.requestAddresses();
				connectedAccountStore.set(address);
				viemWalletClientStore.set(client as WalletClient);
			} catch (err: any) {
				console.error('EOA Wallet connection error:', err);
				const message = err.shortMessage || err.message || 'Failed to connect EOA wallet.';
				walletConnectionErrorStore.set(message);
				connectedAccountStore.set(null);
				viemWalletClientStore.set(null);
			}
		} else {
			walletConnectionErrorStore.set('MetaMask not detected. Please install MetaMask.');
		}
	}

	function disconnectMetaMask() {
		connectedAccountStore.set(null);
		viemWalletClientStore.set(null);
		walletConnectionErrorStore.set(null);
	}

	async function handleCreateWallet() {
		if (!eoaWalletClient || !eoaAccountAddress) {
			walletCreationError = 'EOA Wallet not connected. Please connect it first.';
			return;
		}

		const user = $session.data?.user;
		if (!user) {
			walletCreationError = 'User session not found.';
			return;
		}

		const usernameForPasskey = user.email || user.id || 'hominio-user-wallet';

		isWalletCreating = true;
		walletCreationError = null;
		newPkpEthAddress = null;
		walletFlowState = {
			step: 'Initiating',
			status: 'pending',
			message: 'Starting Hominio Wallet creation...'
		};

		try {
			const finalState = await createNewPasskeyWallet({
				username: usernameForPasskey,
				eoaWalletClient: eoaWalletClient,
				eoaAddress: eoaAccountAddress,
				onStateUpdate: (newState) => {
					walletFlowState = newState;
				}
			});

			if (finalState.status === 'success' && finalState.pkpInfo?.pkpEthAddress) {
				newPkpEthAddress = finalState.pkpInfo.pkpEthAddress;
				try {
					await authClient.getSession();
					console.log('Called authClient.getSession() after wallet creation.');
				} catch (refreshError) {
					console.error(
						'Error calling authClient.getSession() after wallet creation:',
						refreshError
					);
				}
			} else if (finalState.status === 'error') {
				throw finalState.error || new Error(finalState.message || 'Wallet creation failed');
			}
		} catch (err: any) {
			walletCreationError =
				err.message || 'An unknown error occurred during Hominio wallet creation.';
			console.error('Hominio Wallet creation error:', err);
		} finally {
			isWalletCreating = false;
		}
	}

	function formatAuthMethodType(type: bigint): string {
		switch (type) {
			case 0n: // Assuming 0 is commonly "EOA Wallet" if not explicitly defined elsewhere
				return 'EOA Wallet (Implied)';
			case 1n: // As per legacy Lit.ts, this was used for passkeys with addPermittedAuthMethod
				return 'Passkey (via EIP-1271 Verifier)';
			case 2n:
				return 'Lit Action';
			case 3n:
				return 'WebAuthn (Legacy)'; // From legacy example
			case 4n:
				return 'WebAuthn Passkey (General)'; // If this is a more general passkey
			case 5n:
				return 'Discord';
			case 6n: // In our current setup, EIP-1271 passkey verifiers are added as AuthMethodType 6 by Lit's PKPHelper.
				// However, the `getPermittedAuthMethodsForPkp` directly queries the PKPPermissions contract.
				// The auth methods added by `mintPKPWithLitActionAuthAndCapacity` (which uses PKPHelper)
				// are primarily Lit Actions (type 2) or implicitly the PKP itself.
				// If a passkey is added via `pkpWallet.addPermittedAuthMethod({ authMethodType: 6, ...})`
				// this would show up. For our flow, the Lit Action (type 2) is the key authorizer for passkeys.
				// The passkey *itself* isn't typically registered as an auth method of type 6 *on the PKP NFT* in our setup.
				// Instead, the Lit Action (type 2) is, and that Lit Action *uses* the EIP-1271 contract which *validates* the passkey.
				// Let's keep 6 as 'Google' from legacy for now if it's general,
				// but be mindful that our Passkey auth comes via the Lit Action.
				return 'Google / EIP-1271 Address'; // Broadened to reflect its use for EIP-1271 (like Safe)
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
		// Basic hex check, actual conversion to Base58 might be too complex here or not needed if only displaying hex.
		// The legacy code didn't convert it back to Base58 for display if it was already hex.
		return hexId;
	}

	function formatTimestamp(timestamp: bigint): string {
		if (timestamp === 0n || !timestamp) return 'Never / Not Set';
		return new Date(Number(timestamp) * 1000).toLocaleString();
	}

	$effect(() => {
		const currentTab = tabs.find((t) => t.id === activeTab);
		if (currentTab && mobileMenuStore) {
			mobileMenuStore.update((s) => ({ ...s, activeLabel: currentTab.label }));
		}
	});

	onMount(() => {
		const initialTab = tabs.find((t) => t.id === activeTab);
		if (initialTab && mobileMenuStore) {
			mobileMenuStore.update((s) => ({ ...s, activeLabel: initialTab.label }));
		}
	});
</script>

<!-- Outermost container: full height, base styling, NO PADDING/MARGIN -->
<div class="bg-background-app font-ibm-plex-sans text-prussian-blue h-full">
	{#if $session.data?.user}
		{@const allData = $session.data as any}
		{@const userDetails = allData.user}
		{@const sessionInfo = allData.session}
		{@const pkpPasskeyData = currentPkpData}

		<!-- Top-level flex container for aside and main content area -->
		<div class="flex h-full">
			<!-- ASIDE: Fixed width on desktop, full height, manages its own padding. Responsive positioning for mobile. -->
			<aside
				class="bg-background-app fixed top-16 bottom-0 left-0 z-30 w-72 transform p-4 pt-8 shadow-xl transition-transform duration-300 ease-in-out {$mobileMenuStore.isOpen
					? 'translate-x-0'
					: '-translate-x-full'} overflow-y-auto md:static md:top-auto md:bottom-auto md:left-auto md:z-auto md:h-full md:w-72 md:translate-x-0 md:transform-none md:bg-transparent md:p-6 md:pt-8 md:shadow-none"
			>
				<nav class="space-y-2">
					{#each tabs as tab}
						{#if tab.id === 'passkeyDetails' && !pkpPasskeyData}
							<!-- Do not render -->
						{:else if (tab.id === 'authMethods' || tab.id === 'capacityCredits' || tab.id === 'testSigner') && !hasHominioWallet}
							<!-- Do not render these if no Hominio Wallet -->
						{:else if tab.id === 'walletManagement' && newPkpEthAddress && !hasHominioWallet}
							<button
								onclick={() => {
									activeTab = tab.id;
									mobileMenuStore.update((s) => ({ ...s, isOpen: false }));
								}}
								class="{activeTab === tab.id
									? 'bg-buff text-prussian-blue'
									: 'text-prussian-blue/80 hover:bg-timberwolf-1/50'} focus:ring-persian-orange focus:ring-opacity-50 w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors duration-150 focus:ring-2 focus:outline-none"
							>
								{tab.label}
							</button>
						{:else}
							<button
								onclick={() => {
									activeTab = tab.id;
									mobileMenuStore.update((s) => ({ ...s, isOpen: false }));
								}}
								class="{activeTab === tab.id
									? 'bg-buff text-prussian-blue'
									: 'text-prussian-blue/80 hover:bg-timberwolf-1/50'} focus:ring-persian-orange focus:ring-opacity-50 w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors duration-150 focus:ring-2 focus:outline-none"
							>
								{tab.label}
							</button>
						{/if}
					{/each}
				</nav>
			</aside>

			<!-- MAIN CONTENT WRAPPER: Takes remaining space -->
			<div class="min-w-0 flex-1">
				<!-- Centering and max-width container for main content -->
				<div class="mx-auto flex h-full max-w-5xl flex-col">
					<!-- MOVED: Header for main content section (tab label) is now INSIDE the main scrollable content -->

					<!-- Flex container for the scrollable main area - THIS DIV IS NOW THE SCROLL CONTAINER (NO PADDING) -->
					<div
						class="relative flex min-h-0 flex-grow flex-col overflow-y-auto"
						style="-webkit-overflow-scrolling: touch;"
					>
						<!-- Main content area: PADDING APPLIED HERE, esp. pb-32. Header and cards are children. -->
						<main class="min-h-0 w-full flex-1 space-y-6 p-4 pt-8 md:p-6">
							<!-- Header for main content section (tab label) - MOVED HERE -->
							<header class="mb-6 text-center md:mb-8 md:text-left">
								<h1
									class="font-playfair-display text-prussian-blue text-3xl font-normal md:text-4xl"
								>
									{$mobileMenuStore.activeLabel}
								</h1>
							</header>

							{#if activeTab === 'userDetails' && userDetails}
								{@const profileImageUrl = userDetails.image || userDetails.picture}
								<div class="bg-background-surface rounded-xl p-6 shadow-xs">
									<div class="flex flex-col items-center pt-1">
										{#if profileImageUrl}
											<img
												src={profileImageUrl}
												alt="Profile"
												class="mb-4 h-24 w-24 rounded-full object-cover shadow-md md:h-32 md:w-32"
											/>
										{:else}
											<div
												class="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-3xl font-semibold text-slate-600 shadow-md md:h-32 md:w-32"
											>
												{userDetails.name
													? userDetails.name.charAt(0).toUpperCase()
													: userDetails.email
														? userDetails.email.charAt(0).toUpperCase()
														: '?'}
											</div>
										{/if}

										{#if userDetails.name && userDetails.name !== userDetails.email}
											<h4
												class="text-prussian-blue mb-1 text-center text-xl font-semibold md:text-2xl"
											>
												{userDetails.name}
											</h4>
										{/if}

										{#if userDetails.email}
											<p class="text-prussian-blue/80 mb-6 text-center text-sm">
												{userDetails.email}
											</p>
										{/if}

										<hr class="border-timberwolf-2/50 mb-6 w-full border-t" />

										<div class="w-full space-y-3">
											{#if userDetails.id}
												<div
													class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-center"
												>
													<span class="text-prussian-blue/80 font-medium">User ID:</span>
													<span class="text-prussian-blue">{userDetails.id}</span>
												</div>
											{/if}
											{#each Object.entries(userDetails) as [key, value]}
												{@const fieldsToSkip = [
													'email',
													'id',
													'name',
													'pkp_passkey',
													'image',
													'picture'
												]}
												{#if !fieldsToSkip.includes(key)}
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
															<span class="text-prussian-blue text-sm"
																>{String(value ?? 'N/A')}</span
															>
														{/if}
													</div>
												{/if}
											{/each}
										</div>
									</div>
								</div>
							{/if}

							{#if activeTab === 'sessionInfo' && sessionInfo}
								<div class="bg-background-surface rounded-xl p-6 shadow-xs">
									<div class="space-y-3 pt-1">
										{#each Object.entries(sessionInfo) as [key, value]}
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
													<span class="text-prussian-blue text-sm break-all"
														>{String(value ?? 'N/A')}</span
													>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if activeTab === 'passkeyDetails' && pkpPasskeyData}
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
													<span class="text-prussian-blue text-sm break-all"
														>{String(value ?? 'N/A')}</span
													>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							{#if activeTab === 'walletManagement'}
								<div class="bg-background-surface rounded-xl p-6 shadow-xs">
									<div class="pt-1">
										{#if hasHominioWallet}
											<p class="text-prussian-blue">Your Hominio Wallet ETH Address:</p>
											<p class="rounded bg-slate-100 p-2 font-mono text-sm break-all">
												{$session.data?.user?.pkp_passkey &&
												typeof $session.data.user.pkp_passkey === 'object'
													? ($session.data.user.pkp_passkey as ClientPkpPasskey).pkpEthAddress
													: 'Not available'}
											</p>
											{#if pkpPasskeyData?.pkpTokenId}
												<div class="mt-3 text-xs text-slate-500">
													<p>PKP Token ID: {pkpPasskeyData.pkpTokenId}</p>
													{#if pkpPasskeyData?.pubKey}
														<p class="mt-1">
															PKP Public Key: <span class="break-all">{pkpPasskeyData.pubKey}</span>
														</p>
													{/if}
												</div>
											{/if}
										{:else if !eoaAccountAddress}
											<div class="mb-6 rounded-lg border border-orange-300 bg-orange-50 p-4">
												<h4 class="mb-2 text-lg font-semibold text-orange-700">
													Step 1: Connect Your EOA Wallet
												</h4>
												<p class="text-prussian-blue/80 mb-3 text-sm">
													To create a Hominio Wallet, you first need to connect an existing External
													Owned Account (EOA) wallet, like MetaMask, configured for the Gnosis
													chain.
												</p>
												<button
													onclick={connectMetaMask}
													class="focus:ring-persian-orange bg-[#A0522D] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#8B4513] focus:ring-2 focus:outline-none disabled:opacity-50"
												>
													Connect MetaMask (Gnosis)
												</button>
												{#if eoaConnectionError}
													<p class="mt-3 text-xs text-red-600">Error: {eoaConnectionError}</p>
												{/if}
											</div>
										{:else}
											<div
												class="mb-4 flex items-center justify-between rounded-lg border border-[var(--color-moss-green)] bg-[var(--color-moss-green)]/10 p-3"
											>
												<div>
													<p class="text-sm font-medium text-[var(--color-moss-green)]">
														EOA Wallet Connected:
													</p>
													<p
														class="font-mono text-xs break-all text-[var(--color-prussian-blue)]/80"
													>
														{eoaAccountAddress}
													</p>
												</div>
												<button
													onclick={disconnectMetaMask}
													class="rounded border border-[var(--color-rosy-brown)] px-2 py-1 text-xs font-medium text-[var(--color-rosy-brown)] transition-colors hover:bg-[var(--color-rosy-brown)]/10 focus:ring-2 focus:ring-[var(--color-rosy-brown)]/50 focus:outline-none"
													title="Disconnect EOA Wallet"
												>
													Disconnect
												</button>
											</div>
											<p class="text-prussian-blue/90 mb-4">
												You do not have a Hominio Wallet set up yet. Create one to manage your
												digital assets and interactions within Hominio.
											</p>
											{#if isWalletCreating || walletFlowState}
												<div class="border-buff my-4 space-y-2 rounded-lg border p-4">
													<p class="text-prussian-blue text-sm font-semibold">
														{walletFlowState?.step || 'Processing...'}
													</p>
													{#if walletFlowState?.message}
														<p class="text-prussian-blue/80 text-xs">
															{walletFlowState.message}
														</p>
													{/if}
													{#if walletFlowState?.status === 'pending'}
														<div
															class="border-persian-orange h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
														></div>
													{/if}
												</div>
											{/if}
											{#if walletCreationError}
												<p class="my-3 text-sm text-red-600">Error: {walletCreationError}</p>
											{/if}
											{#if newPkpEthAddress}
												<div
													class="my-3 rounded-lg border border-[var(--color-moss-green)] bg-[var(--color-moss-green)]/10 p-4"
												>
													<p class="font-semibold text-[var(--color-moss-green)]">
														Wallet Created Successfully!
													</p>
													<p class="text-xs text-[var(--color-moss-green)]/80">
														Your new Hominio Wallet Address:
													</p>
													<p class="font-mono text-sm break-all text-[var(--color-prussian-blue)]">
														{newPkpEthAddress}
													</p>
													<p class="mt-2 text-xs text-slate-500">
														It might take a moment for this page to fully reflect the new wallet
														status. You can try refreshing.
													</p>
												</div>
											{/if}
											{#if !newPkpEthAddress}
												<button
													onclick={handleCreateWallet}
													disabled={isWalletCreating}
													class="focus:ring-persian-orange bg-prussian-blue text-linen hover:bg-opacity-90 mt-2 w-full rounded-lg px-5 py-2.5 text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
												>
													{#if isWalletCreating}
														Processing...
													{:else}
														Create Hominio Wallet
													{/if}
												</button>
											{/if}
										{/if}
									</div>
								</div>
							{/if}

							{#if activeTab === 'authMethods'}
								<div class="bg-background-surface rounded-xl p-6 shadow-xs">
									<div class="pt-1">
										{#if !hasHominioWallet}
											<p class="text-prussian-blue/70 text-sm">
												Please set up your Hominio Wallet to view authorized methods.
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
																<span class="font-mono break-all">{method.userPubkey || 'N/A'}</span
																>
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
							{/if}

							{#if activeTab === 'capacityCredits'}
								<div class="bg-background-surface rounded-xl p-6 shadow-xs">
									<div class="pt-1">
										{#if !hasHominioWallet}
											<p class="text-prussian-blue/70 text-sm">
												Please set up your Hominio Wallet to view capacity credits.
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
															<span class="text-prussian-blue font-mono text-xs"
																>{credit.tokenId}</span
															>
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
											<p class="text-prussian-blue/70 text-sm">
												No capacity credits found for this PKP.
											</p>
										{/if}
									</div>
								</div>
							{/if}

							{#if activeTab === 'testSigner'}
								<div class="bg-background-surface rounded-xl p-6 shadow-xs">
									<h4 class="text-prussian-blue mb-4 text-lg font-semibold">Test Signer Actions</h4>
									{#if hasHominioWallet}
										<div class="space-y-3">
											<!-- Inputs for Custom Message Signing -->
											<div class="border-timberwolf-2/30 my-4 space-y-2 border-t border-b py-4">
												<div>
													<label
														for="customMessageToSign"
														class="text-prussian-blue/80 mb-1 block text-xs font-medium"
														>Custom Message to Sign:</label
													>
													<textarea
														id="customMessageToSign"
														rows="3"
														bind:value={customMessageText}
														placeholder="Enter message to sign..."
														class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 text-xs shadow-sm sm:text-sm"
													></textarea>
												</div>
											</div>
											<button
												onclick={() => {
													const messageToSign = customMessageText.trim();
													if (!messageToSign) {
														// Optionally, open modal with default message if input is empty, or navigate with no message param
														goto('/me?actionType=signMessage'); // Triggers default message in layout
														// openSignMessageModalFromLayout?.(); // Alternative: direct call for default
														return;
													}
													const params = new URLSearchParams();
													params.set('actionType', 'signMessage');
													params.set('message', messageToSign); // No need to encode if using URLSearchParams
													goto(`/me?${params.toString()}`);
												}}
												class="mt-2 w-full rounded-lg bg-[var(--color-prussian-blue)] px-5 py-2.5 text-sm font-medium text-[var(--color-linen)] transition-colors hover:brightness-90 focus:ring-2 focus:ring-[var(--color-persian-orange)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
											>
												Sign Custom Message
											</button>

											<!-- Inputs for Custom Lit Action -->
											<div class="border-timberwolf-2/30 my-4 space-y-2 border-t border-b py-4">
												<div>
													<label
														for="customLitActionCid"
														class="text-prussian-blue/80 mb-1 block text-xs font-medium"
														>Custom Lit Action CID:</label
													>
													<input
														id="customLitActionCid"
														type="text"
														bind:value={customLitActionCidText}
														placeholder="Enter Lit Action CID (e.g., local:example-42.js)"
														class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 text-xs shadow-sm sm:text-sm"
													/>
												</div>
												<div>
													<label
														for="customJsParams"
														class="text-prussian-blue/80 mb-1 block text-xs font-medium"
														>Custom JS Params (JSON):</label
													>
													<textarea
														id="customJsParams"
														rows="3"
														bind:value={customJsParamsText}
														placeholder={jsParamsPlaceholderString}
														class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 font-mono text-xs shadow-sm sm:text-sm"
													></textarea>
												</div>
											</div>

											<button
												onclick={() => {
													let parsedJsParams = {};
													try {
														parsedJsParams = customJsParamsText.trim()
															? JSON.parse(customJsParamsText)
															: {};
													} catch (e) {
														alert('Invalid JSON in JS Params. Please correct it.');
														return;
													}
													const cidToExecute = customLitActionCidText.trim();
													if (!cidToExecute) {
														// Navigate with no CID to trigger default CID in layout, or handle as error
														goto(
															`/me?actionType=executeLitAction&jsParams=${encodeURIComponent(JSON.stringify(parsedJsParams))}`
														);
														return;
													}
													const params = new URLSearchParams();
													params.set('actionType', 'executeLitAction');
													params.set('cid', cidToExecute);
													if (Object.keys(parsedJsParams).length > 0) {
														params.set('jsParams', JSON.stringify(parsedJsParams));
													}
													goto(`/me?${params.toString()}`);
												}}
												class="mt-2 w-full rounded-lg bg-[var(--color-prussian-blue)] px-5 py-2.5 text-sm font-medium text-[var(--color-linen)] transition-colors hover:brightness-90 focus:ring-2 focus:ring-[var(--color-persian-orange)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
											>
												Execute Lit Action by CID
											</button>
										</div>
									{:else}
										<p class="text-prussian-blue/70 text-sm">
											Please set up your Hominio Wallet to use the Test Signer.
										</p>
									{/if}
								</div>
							{/if}

							{#if activeTab === 'rawDebug'}
								<div class="bg-background-surface rounded-xl p-6 shadow-xs">
									<div
										class="bg-prussian-blue overflow-auto rounded-lg p-4 pt-1 text-left shadow-inner"
									>
										<pre class="text-linen text-xs">{JSON.stringify(allData, null, 2)}</pre>
									</div>
								</div>
							{/if}

							<div class="h-4"></div>
						</main>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Fallback for when user is not signed in -->
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
