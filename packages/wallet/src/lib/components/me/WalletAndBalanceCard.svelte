<script lang="ts">
	import { type ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';
	import {
		viemWalletClientStore,
		connectedAccountStore,
		walletConnectionErrorStore,
		viemPublicClientStore
	} from '$lib/stores/walletStore';
	import {
		createWalletClient,
		custom,
		type WalletClient,
		type Address,
		type PublicClient,
		formatUnits
	} from 'viem';
	import { gnosis } from 'viem/chains';
	import { erc20Abi } from 'viem';
	import {
		createNewPasskeyWallet,
		type WalletSetupState
	} from '$lib/wallet/services/walletSetupOrchestrationService';

	// Define props using $props rune for Svelte 5
	let { currentPkpData, sessionUser, authClient, activeTab, hasHominioWallet } = $props<{
		currentPkpData: ClientPkpPasskey | null;
		sessionUser: any; // Consider a more specific type if available
		authClient: any; // Using any for now, replace with actual type if known e.g. from '@betterTokens/betterauth-svelte-client' or $lib/client/betterauth-client
		activeTab: string;
		hasHominioWallet: boolean;
	}>();

	// Wallet Creation State
	let walletFlowState = $state<WalletSetupState | null>(null);
	let isWalletCreating = $state(false);
	let newPkpEthAddress = $state<Address | null>(null);
	let walletCreationError = $state<string | null>(null);

	// EOA Wallet State (synced from stores)
	let eoaWalletClient = $state<WalletClient | null>(null);
	let eoaAccountAddress = $state<Address | null>(null);
	let eoaConnectionError = $state<string | null>(null);

	// Public Client (synced from store)
	let publicClient = $state<PublicClient | null>(null);

	// Sahel Token Balance State
	let sahelTokenBalance = $state<string | null>(null);
	let isLoadingSahelBalance = $state(false);
	let sahelBalanceError = $state<string | null>(null);
	const SAHEL_TOKEN_ADDRESS: Address = '0x181CA58494Fc2C75FF805DEAA32ecD78377e135e';
	const SAHEL_TOKEN_DECIMALS = 18;

	// Sync with Svelte stores for EOA and public client information
	$effect(() => {
		eoaWalletClient = $viemWalletClientStore;
		eoaAccountAddress = $connectedAccountStore as Address | null;
		eoaConnectionError = $walletConnectionErrorStore;
		publicClient = $viemPublicClientStore;
	});

	// Effect to fetch Sahel balance when tab is active and wallet is ready
	$effect(() => {
		if (
			activeTab === 'walletAndBalance' &&
			hasHominioWallet &&
			publicClient &&
			currentPkpData?.pkpEthAddress
		) {
			fetchSahelBalance();
		} else if (activeTab === 'walletAndBalance' && !hasHominioWallet) {
			sahelBalanceError = 'Wallet not set up. Cannot fetch balance.';
			sahelTokenBalance = null;
		}
	});

	async function fetchSahelBalance() {
		if (!publicClient || !currentPkpData?.pkpEthAddress) {
			sahelBalanceError = 'Gnosis client or PKP ETH address not available.';
			sahelTokenBalance = null;
			return;
		}
		isLoadingSahelBalance = true;
		sahelBalanceError = null;
		sahelTokenBalance = null;
		try {
			const balance = await publicClient.readContract({
				address: SAHEL_TOKEN_ADDRESS,
				abi: erc20Abi,
				functionName: 'balanceOf',
				args: [currentPkpData.pkpEthAddress as Address]
			});
			sahelTokenBalance = formatUnits(balance, SAHEL_TOKEN_DECIMALS);
			console.log('[WalletAndBalanceCard] Fetched SAHEL Balance:', sahelTokenBalance);
		} catch (err: any) {
			console.error('[WalletAndBalanceCard] Error fetching SAHEL balance:', err);
			sahelBalanceError = `Failed to fetch SAHEL balance: ${err.message || 'Unknown error'}`;
			sahelTokenBalance = null;
		} finally {
			isLoadingSahelBalance = false;
		}
	}

	async function connectMetaMask() {
		walletConnectionErrorStore.set(null);
		// eoaConnectionError = null; // This is reactive to the store, so direct set isn't needed here
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

		if (!sessionUser) {
			walletCreationError = 'User session not found.';
			return;
		}

		const usernameForPasskey = sessionUser.email || sessionUser.id || 'hominio-user-wallet';

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
					// It's important that the parent component's session is refreshed.
					// This component shouldn't directly call authClient.getSession() if that triggers page-level reloads or state changes.
					// Instead, it might need to emit an event, or the parent handles session refresh after wallet creation.
					// For now, relying on parent to handle session refresh if needed.
					await authClient.getSession(); // If this client is scoped or state managed by parent, this is fine.
					console.log(
						'[WalletAndBalanceCard] Called authClient.getSession() after wallet creation.'
					);
				} catch (refreshError) {
					console.error(
						'[WalletAndBalanceCard] Error calling authClient.getSession() after wallet creation:',
						refreshError
					);
				}
			} else if (finalState.status === 'error') {
				throw finalState.error || new Error(finalState.message || 'Wallet creation failed');
			}
		} catch (err: any) {
			walletCreationError =
				err.message || 'An unknown error occurred during Hominio wallet creation.';
			console.error('[WalletAndBalanceCard] Hominio Wallet creation error:', err);
		} finally {
			isWalletCreating = false;
		}
	}
</script>

<div class="bg-background-surface rounded-xl p-6 shadow-xs">
	<div class="pt-1">
		{#if hasHominioWallet && currentPkpData?.pkpEthAddress}
			<div class="mb-6">
				<p class="text-prussian-blue">Your Wallet ETH Address:</p>
				<p class="rounded bg-slate-100 p-2 font-mono text-sm break-all">
					{currentPkpData.pkpEthAddress}
				</p>
			</div>

			<div>
				<h4 class="text-prussian-blue mb-3 text-lg font-semibold">SAHEL Token Balance</h4>
				{#if isLoadingSahelBalance}
					<div class="flex items-center justify-start p-4">
						<div class="spinner text-prussian-blue/80 mr-3 h-5 w-5"></div>
						<p class="text-prussian-blue/80 text-sm">Loading SAHEL token balance...</p>
					</div>
				{:else if sahelBalanceError}
					<div class="rounded-md bg-red-50 p-3">
						<p class="text-sm text-red-700">
							<span class="font-medium">Error:</span>
							{sahelBalanceError}
						</p>
					</div>
				{:else if sahelTokenBalance !== null}
					<div class="space-y-2">
						<p class="text-persian-orange text-3xl font-semibold">{sahelTokenBalance} SAHEL</p>
						<button
							onclick={fetchSahelBalance}
							disabled={isLoadingSahelBalance}
							class="focus:ring-persian-orange/70 hover:bg-opacity-90 mt-4 rounded-lg bg-slate-200 px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
						>
							{#if isLoadingSahelBalance}
								<span class="spinner-tiny mr-1.5"></span>Refreshing...
							{:else}
								Refresh Balance
							{/if}
						</button>
					</div>
				{:else}
					<p class="text-prussian-blue/70 text-sm">
						Could not retrieve SAHEL token balance. Try refreshing.
					</p>
				{/if}
			</div>
		{:else if !eoaAccountAddress}
			<div class="mb-6 rounded-lg border border-orange-300 bg-orange-50 p-4">
				<h4 class="mb-2 text-lg font-semibold text-orange-700">Step 1: Connect Your EOA Wallet</h4>
				<p class="text-prussian-blue/80 mb-3 text-sm">
					To create a Wallet, you first need to connect an existing External Owned Account (EOA)
					wallet, like MetaMask, configured for the Gnosis chain.
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
					<p class="text-sm font-medium text-[var(--color-moss-green)]">EOA Wallet Connected:</p>
					<p class="font-mono text-xs break-all text-[var(--color-prussian-blue)]/80">
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
				You do not have a Wallet set up yet. Create one to manage your digital assets and
				interactions.
			</p>
			{#if isWalletCreating || walletFlowState}
				<div class="border-buff my-4 space-y-2 rounded-lg border p-4">
					<p class="text-prussian-blue text-sm font-semibold">
						{walletFlowState?.step || 'Processing...'}
					</p>
					{#if walletFlowState?.message}
						<p class="text-prussian-blue/80 text-xs">{walletFlowState.message}</p>
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
					<p class="font-semibold text-[var(--color-moss-green)]">Wallet Created Successfully!</p>
					<p class="text-xs text-[var(--color-moss-green)]/80">Your new Wallet Address:</p>
					<p class="font-mono text-sm break-all text-[var(--color-prussian-blue)]">
						{newPkpEthAddress}
					</p>
					<p class="mt-2 text-xs text-slate-500">
						It might take a moment for this page to fully reflect the new wallet status. You can try
						refreshing or changing tabs.
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
						Create Wallet
					{/if}
				</button>
			{/if}
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
	/* For spinner-tiny if used */
	.spinner-tiny {
		display: inline-block;
		border: 2px solid currentColor; /* Slightly thinner border */
		border-right-color: transparent;
		width: 0.8em; /* Smaller size */
		height: 0.8em; /* Smaller size */
		border-radius: 50%;
		animation: spin 0.6s linear infinite; /* Slightly faster spin */
		vertical-align: text-bottom;
	}
</style>
