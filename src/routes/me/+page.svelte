<script lang="ts">
	import { authClient } from '$lib/client/betterauth-client';
	import {
		createNewPasskeyWallet,
		type WalletSetupState
	} from '$lib/wallet/services/walletSetupOrchestrationService';
	import {
		viemWalletClientStore,
		connectedAccountStore,
		walletConnectionErrorStore
	} from '$lib/stores/walletStore';
	import { createWalletClient, custom, type WalletClient, type Address } from 'viem';
	import { gnosis } from 'viem/chains';
	import type { ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';

	const session = authClient.useSession();
	let activeTab = $state('userDetails');

	const tabs = [
		{ id: 'userDetails', label: 'User Details' },
		{ id: 'sessionInfo', label: 'Session Information' },
		{ id: 'passkeyDetails', label: 'Passkey Details' },
		{ id: 'walletManagement', label: 'Hominio Wallet' },
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

	$effect(() => {
		eoaWalletClient = $viemWalletClientStore;
		eoaAccountAddress = $connectedAccountStore as Address | null;
		eoaConnectionError = $walletConnectionErrorStore;
	});

	// Determine if wallet exists - Placeholder logic, needs refinement
	// This should ideally check for a specific field confirming successful PKP setup, e.g., pkp_passkey.pkpEthAddress
	let hasHominioWallet = $derived(
		!!(
			$session.data?.user?.pkp_passkey &&
			typeof $session.data.user.pkp_passkey === 'object' &&
			($session.data.user.pkp_passkey as ClientPkpPasskey).pkpEthAddress
		)
	);

	// ADDED: EOA Connection Logic (from +layout.svelte)
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
</script>

<div class="bg-linen font-ibm-plex-sans text-prussian-blue min-h-screen p-4 pt-8 md:p-8">
	<div class="mx-auto max-w-6xl">
		{#if $session.data?.user}
			{@const allData = $session.data as any}
			{@const userDetails = allData.user}
			{@const sessionInfo = allData.session}
			{@const pkpPasskeyData =
				userDetails?.pkp_passkey && typeof userDetails.pkp_passkey === 'object'
					? (userDetails.pkp_passkey as ClientPkpPasskey)
					: null}

			<header class="mb-10 text-center md:text-left">
				<h1 class="font-playfair-display text-prussian-blue text-4xl font-normal md:text-5xl">
					Account Settings
				</h1>
				<p class="text-prussian-blue/80 mt-1 text-lg">Manage your profile and session details.</p>
			</header>

			<div class="flex flex-col gap-8 md:flex-row md:gap-10">
				<!-- Aside Navigation -->
				<aside class="w-full md:w-1/4">
					<nav class="space-y-2">
						{#each tabs as tab}
							{#if tab.id === 'passkeyDetails' && !pkpPasskeyData}
								<!-- Do not render Passkey Details tab if pkpPasskeyData is not present -->
							{:else if tab.id === 'walletManagement' && newPkpEthAddress && !hasHominioWallet}
								<!-- If wallet just created but session not yet updated, still show wallet tab -->
								<button
									onclick={() => (activeTab = tab.id)}
									class="{activeTab === tab.id
										? 'bg-buff text-prussian-blue'
										: 'text-prussian-blue/80 hover:bg-timberwolf-1/50'} focus:ring-persian-orange focus:ring-opacity-50 w-full rounded-lg p-3 text-left text-sm font-medium transition-colors duration-150 focus:ring-2 focus:outline-none"
								>
									{tab.label}
								</button>
							{:else}
								<button
									onclick={() => (activeTab = tab.id)}
									class="{activeTab === tab.id
										? 'bg-buff text-prussian-blue'
										: 'text-prussian-blue/80 hover:bg-timberwolf-1/50'} focus:ring-persian-orange focus:ring-opacity-50 w-full rounded-lg p-3 text-left text-sm font-medium transition-colors duration-150 focus:ring-2 focus:outline-none"
								>
									{tab.label}
								</button>
							{/if}
						{/each}
					</nav>
				</aside>

				<!-- Main Content Area -->
				<main class="w-full flex-1 space-y-6 md:w-3/4">
					<!-- User Details Section -->
					{#if activeTab === 'userDetails' && userDetails}
						<div class="rounded-xl bg-white p-6 shadow-lg">
							<h3
								class="border-timberwolf-2/70 text-prussian-blue mb-5 border-b pb-3 text-xl font-semibold"
							>
								User Details
							</h3>
							<div class="space-y-3">
								{#if userDetails.email}
									<div
										class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-center"
									>
										<span class="text-prussian-blue/80 font-medium">Email:</span>
										<span class="text-prussian-blue">{userDetails.email}</span>
									</div>
								{/if}
								{#if userDetails.id}
									<div
										class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-center"
									>
										<span class="text-prussian-blue/80 font-medium">User ID:</span>
										<span class="text-prussian-blue">{userDetails.id}</span>
									</div>
								{/if}
								{#if userDetails.name && userDetails.name !== userDetails.email}
									<div
										class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-center"
									>
										<span class="text-prussian-blue/80 font-medium">Name:</span>
										<span class="text-prussian-blue">{userDetails.name}</span>
									</div>
								{/if}
								{#each Object.entries(userDetails) as [key, value]}
									{@const fieldsToSkip = ['email', 'id', 'name', 'pkp_passkey']}
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
												<span class="text-prussian-blue text-sm">{String(value ?? 'N/A')}</span>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					<!-- Session Information Section -->
					{#if activeTab === 'sessionInfo' && sessionInfo}
						<div class="rounded-xl bg-white p-6 shadow-lg">
							<h3
								class="border-timberwolf-2/70 text-prussian-blue mb-5 border-b pb-3 text-xl font-semibold"
							>
								Session Information
							</h3>
							<div class="space-y-3">
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

					<!-- Passkey Details Section -->
					{#if activeTab === 'passkeyDetails' && pkpPasskeyData}
						<div class="rounded-xl bg-white p-6 shadow-lg">
							<h3
								class="border-timberwolf-2/70 text-prussian-blue mb-5 border-b pb-3 text-xl font-semibold"
							>
								Passkey Details
							</h3>
							<div class="space-y-3">
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

					<!-- Wallet Management Section -->
					{#if activeTab === 'walletManagement'}
						<div class="rounded-xl bg-white p-6 shadow-lg">
							<h3
								class="border-timberwolf-2/70 text-prussian-blue mb-5 border-b pb-3 text-xl font-semibold"
							>
								Hominio Wallet
							</h3>
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
							{:else}
								<!-- Step 0: EOA Connection (If not connected) -->
								{#if !eoaAccountAddress}
									<div class="mb-6 rounded-lg border border-orange-300 bg-orange-50 p-4">
										<h4 class="mb-2 text-lg font-semibold text-orange-700">
											Step 1: Connect Your EOA Wallet
										</h4>
										<p class="text-prussian-blue/80 mb-3 text-sm">
											To create a Hominio Wallet, you first need to connect an existing External
											Owned Account (EOA) wallet, like MetaMask, configured for the Gnosis chain.
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
									<!-- EOA Connected, show wallet creation steps -->
									<div
										class="mb-4 flex items-center justify-between rounded-lg border border-green-300 bg-green-50 p-3"
									>
										<div>
											<p class="text-sm font-medium text-green-700">EOA Wallet Connected:</p>
											<p class="font-mono text-xs break-all text-green-600">{eoaAccountAddress}</p>
										</div>
										<button
											onclick={disconnectMetaMask}
											class="rounded bg-red-500 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600"
											title="Disconnect EOA Wallet"
										>
											Disconnect
										</button>
									</div>

									<p class="text-prussian-blue/90 mb-4">
										You do not have a Hominio Wallet set up yet. Create one to manage your digital
										assets and interactions within Hominio.
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
										<div class="my-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4">
											<p class="font-semibold text-emerald-700">Wallet Created Successfully!</p>
											<p class="text-xs text-emerald-600">Your new Hominio Wallet Address:</p>
											<p class="font-mono text-sm break-all text-emerald-800">{newPkpEthAddress}</p>
											<p class="mt-2 text-xs text-slate-500">
												It might take a moment for this page to fully reflect the new wallet status.
												You can try refreshing.
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
							{/if}
						</div>
					{/if}

					<!-- Raw Debug Data Section -->
					{#if activeTab === 'rawDebug'}
						<div class="rounded-xl bg-white p-6 shadow-lg">
							<h3
								class="border-timberwolf-2/70 text-prussian-blue mb-5 border-b pb-3 text-xl font-semibold"
							>
								Full Raw Session Data (Debug)
							</h3>
							<div class="bg-prussian-blue overflow-auto rounded-lg p-4 text-left shadow-inner">
								<pre class="text-linen text-xs">{JSON.stringify(allData, null, 2)}</pre>
							</div>
						</div>
					{/if}
				</main>
			</div>
		{:else}
			<!-- This part should ideally not be reached due to the redirect in +layout.svelte -->
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
</div>

<!-- Basic spinner style -->
<style>
	.spinner {
		display: inline-block;
		border: 3px solid currentColor; /* Use Tailwind colors via class or keep currentColor */
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
