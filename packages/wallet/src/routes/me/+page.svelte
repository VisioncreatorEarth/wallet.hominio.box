<script lang="ts">
	import { authClient } from '$lib/client/betterauth-client';

	import {
		getPermittedAuthMethodsForPkp,
		getOwnedCapacityCredits,
		type PermittedAuthMethod,
		type CapacityCredit
	} from '$lib/wallet/services/litService';
	import {
		viemWalletClientStore,
		connectedAccountStore,
		walletConnectionErrorStore,
		viemPublicClientStore
	} from '$lib/stores/walletStore';
	import { type WalletClient, type Address, type PublicClient } from 'viem';
	import type { ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';
	import { browser } from '$app/environment';
	import { getContext, onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import { afterNavigate } from '$app/navigation';
	import UserDetailsCard from '../../lib/components/me/UserDetailsCard.svelte';
	import WalletAndBalanceCard from '../../lib/components/me/WalletAndBalanceCard.svelte';
	import TestSignerCard from '../../lib/components/me/TestSignerCard.svelte';
	import BillingSubscriptionsCard from '../../lib/components/me/BillingSubscriptionsCard.svelte';
	import SessionInfoCard from '../../lib/components/me/SessionInfoCard.svelte';
	import PasskeyDetailsCard from '../../lib/components/me/PasskeyDetailsCard.svelte';
	import AuthorizedMethodsCard from '../../lib/components/me/AuthorizedMethodsCard.svelte';
	import CapacityCreditsCard from '../../lib/components/me/CapacityCreditsCard.svelte';
	import RawDebugDataCard from '../../lib/components/me/RawDebugDataCard.svelte';

	interface MobileMenuStore {
		isOpen: boolean;
		activeLabel: string;
	}

	const mobileMenuContextKey = 'mobileMenu';
	const mobileMenuStore = getContext<Writable<MobileMenuStore>>(mobileMenuContextKey);

	const session = authClient.useSession();

	// New tab structure
	const mainTabs = [
		{ id: 'userDetails', label: 'User Details' },
		{ id: 'walletAndBalance', label: 'Wallet & Balance' },
		{ id: 'testSigner', label: 'Test Signer' },
		{ id: 'billingSubscriptions', label: 'Billing & Subscriptions' }
	];

	const advancedCategoryLabel = 'Developer Settings';
	const advancedTabs = [
		{ id: 'sessionInfo', label: 'Session Information' },
		{ id: 'passkeyDetails', label: 'Passkey Details' },
		{ id: 'authMethods', label: 'Authorized Methods' },
		{ id: 'capacityCredits', label: 'Capacity Credits' },
		{ id: 'rawDebug', label: 'Raw Debug Data' }
	];

	let activeTab = $state(mainTabs[0]?.id || 'userDetails');
	let isAdvancedOpen = $state(false);

	function findTabById(tabId: string) {
		return mainTabs.find((t) => t.id === tabId) || advancedTabs.find((t) => t.id === tabId);
	}

	function selectTab(tabId: string) {
		const targetTab = findTabById(tabId);
		if (!targetTab) return;

		activeTab = tabId;
		if (advancedTabs.some((t) => t.id === tabId)) {
			isAdvancedOpen = true;
		}
		// No need to close advanced section if a main tab is selected, user can toggle

		if (mobileMenuStore) {
			mobileMenuStore.update((s) => ({ ...s, isOpen: false }));
		}

		if (browser) {
			const url = new URL(window.location.href);
			url.searchParams.set('tab', tabId);
			history.replaceState(history.state, '', url);
		}
	}

	$effect(() => {
		const currentTabObject = findTabById(activeTab);
		if (currentTabObject && mobileMenuStore) {
			mobileMenuStore.update((s) => ({ ...s, activeLabel: currentTabObject.label }));
		}
	});

	function processUrlTab() {
		if (!browser) return;
		const urlParams = new URLSearchParams(window.location.search);
		let tabFromUrl = urlParams.get('tab');

		// Map old tab IDs to new ones
		if (tabFromUrl === 'walletManagement' || tabFromUrl === 'tokenBalance') {
			tabFromUrl = 'walletAndBalance';
		} else if (tabFromUrl === 'billingPortal') {
			tabFromUrl = 'billingSubscriptions';
		}
		// Add other old tab ID mappings if any, e.g. 'rawDebugData' -> 'rawDebug'

		const targetTab = tabFromUrl ? findTabById(tabFromUrl) : null;

		if (targetTab) {
			if (activeTab !== targetTab.id) {
				activeTab = targetTab.id;
			}
			if (advancedTabs.some((t) => t.id === targetTab.id)) {
				isAdvancedOpen = true;
			}
			// Ensure URL reflects the potentially mapped tabId
			if (tabFromUrl !== targetTab.id) {
				const url = new URL(window.location.href);
				url.searchParams.set('tab', targetTab.id); // set the corrected one
				history.replaceState(history.state, '', url);
			}
		} else if (mainTabs.length > 0 && !findTabById(activeTab)) {
			// If current activeTab is somehow invalid and no URL tab, reset to default
			activeTab = mainTabs[0].id;
			isAdvancedOpen = false; // Reset advanced section state too
			const url = new URL(window.location.href);
			url.searchParams.set('tab', activeTab);
			history.replaceState(history.state, '', url);
		}
	}

	onMount(() => {
		processUrlTab();
		// Ensure mobile menu is correctly set after initial processing
		const currentTabObject = findTabById(activeTab);
		if (currentTabObject && mobileMenuStore) {
			mobileMenuStore.update((s) => ({ ...s, isOpen: false, activeLabel: currentTabObject.label }));
		} else if (mainTabs.length > 0 && mobileMenuStore) {
			mobileMenuStore.update((s) => ({ ...s, isOpen: false, activeLabel: mainTabs[0].label }));
		}
	});

	afterNavigate((navigation) => {
		// only process if the 'tab' param is actually present or changed.
		if (
			navigation.to?.url.searchParams.has('tab') ||
			navigation.from?.url.searchParams.get('tab') !== navigation.to?.url.searchParams.get('tab')
		) {
			processUrlTab();
		}
	});

	let eoaWalletClient = $state<WalletClient | null>(null);
	let eoaAccountAddress = $state<Address | null>(null);
	let eoaConnectionError = $state<string | null>(null);

	let publicClient = $state<PublicClient | null>(null);

	let ownedCapacityCredits = $state<CapacityCredit[] | null>(null);
	let permittedAuthMethods = $state<PermittedAuthMethod[] | null>(null);
	let isLoadingWalletDetails = $state(false);
	let walletDetailsError = $state<string | null>(null);

	$effect(() => {
		eoaWalletClient = $viemWalletClientStore;
		eoaAccountAddress = $connectedAccountStore as Address | null;
		eoaConnectionError = $walletConnectionErrorStore;
		publicClient = $viemPublicClientStore;
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
</script>

<div class="bg-background-app font-ibm-plex-sans text-prussian-blue h-full">
	{#if $session.data?.user}
		{@const allData = $session.data as any}
		{@const userDetails = allData.user}
		{@const sessionInfo = allData.session}
		{@const pkpPasskeyData = currentPkpData}

		<div class="flex h-full">
			<aside
				class="bg-background-app fixed top-16 bottom-0 left-0 z-30 w-72 transform p-4 pt-8 shadow-xl transition-transform duration-300 ease-in-out {$mobileMenuStore.isOpen
					? 'translate-x-0'
					: '-translate-x-full'} overflow-y-auto md:static md:top-auto md:bottom-auto md:left-auto md:z-auto md:h-full md:w-72 md:translate-x-0 md:transform-none md:bg-transparent md:p-6 md:pt-8 md:shadow-none"
			>
				<nav class="space-y-2">
					<!-- Main Tabs -->
					{#each mainTabs as tab}
						{#if tab.id === 'testSigner' && !hasHominioWallet}
							<!-- Skip Test Signer if no wallet -->
						{:else}
							<button
								onclick={() => selectTab(tab.id)}
								class="{activeTab === tab.id
									? 'bg-buff text-prussian-blue'
									: 'text-prussian-blue/80 hover:bg-timberwolf-1/50'} focus:ring-persian-orange focus:ring-opacity-50 w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors duration-150 focus:ring-2 focus:outline-none"
							>
								{tab.label}
							</button>
						{/if}
					{/each}

					<!-- Advanced Section Toggle -->
					<div class="border-timberwolf-2/30 my-3 border-t pt-3">
						<button
							onclick={() => (isAdvancedOpen = !isAdvancedOpen)}
							class="text-prussian-blue/80 hover:bg-timberwolf-1/50 focus:ring-persian-orange focus:ring-opacity-50 flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors duration-150 focus:ring-2 focus:outline-none"
						>
							<span>{advancedCategoryLabel}</span>
							<span
								class="transform transition-transform duration-200 {isAdvancedOpen
									? 'rotate-180'
									: ''}"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
								</svg>
							</span>
						</button>
					</div>

					<!-- Advanced Tabs -->
					{#if isAdvancedOpen}
						<div class="space-y-2 pl-3">
							{#each advancedTabs as tab}
								{#if tab.id === 'passkeyDetails' && !pkpPasskeyData}
									<!-- Skip Passkey Details if no pkpPasskeyData -->
								{:else if (tab.id === 'authMethods' || tab.id === 'capacityCredits') && !hasHominioWallet}
									<!-- Skip Auth Methods/Capacity Credits if no wallet -->
								{:else}
									<button
										onclick={() => selectTab(tab.id)}
										class="{activeTab === tab.id
											? 'bg-buff text-prussian-blue'
											: 'text-prussian-blue/80 hover:bg-timberwolf-1/50'} focus:ring-persian-orange focus:ring-opacity-50 w-full rounded-lg px-4 py-2.5 text-left text-xs font-medium transition-colors duration-150 focus:ring-2 focus:outline-none"
									>
										{tab.label}
									</button>
								{/if}
							{/each}
						</div>
					{/if}
				</nav>
			</aside>

			<div class="min-w-0 flex-1">
				<div class="mx-auto flex h-full max-w-5xl flex-col">
					<div
						class="relative flex min-h-0 flex-grow flex-col overflow-y-auto"
						style="-webkit-overflow-scrolling: touch;"
					>
						<main class="min-h-0 w-full flex-1 space-y-6 p-4 pt-8 md:p-6">
							<header class="mb-6 text-center md:mb-8 md:text-left">
								<h1
									class="font-playfair-display text-prussian-blue text-3xl font-normal md:text-4xl"
								>
									{$mobileMenuStore.activeLabel}
								</h1>
							</header>

							{#if activeTab === 'userDetails' && userDetails}
								<UserDetailsCard {userDetails} />
							{/if}

							{#if activeTab === 'sessionInfo' && sessionInfo}
								<SessionInfoCard {sessionInfo} />
							{/if}

							{#if activeTab === 'passkeyDetails' && pkpPasskeyData}
								<PasskeyDetailsCard {pkpPasskeyData} />
							{/if}

							{#if activeTab === 'walletAndBalance'}
								<WalletAndBalanceCard
									{currentPkpData}
									sessionUser={$session.data?.user}
									{authClient}
									{activeTab}
									{hasHominioWallet}
								/>
							{/if}

							{#if activeTab === 'authMethods'}
								<AuthorizedMethodsCard
									{hasHominioWallet}
									{isLoadingWalletDetails}
									{walletDetailsError}
									{permittedAuthMethods}
								/>
							{/if}

							{#if activeTab === 'capacityCredits'}
								<CapacityCreditsCard
									{hasHominioWallet}
									{isLoadingWalletDetails}
									{walletDetailsError}
									{ownedCapacityCredits}
								/>
							{/if}

							{#if activeTab === 'testSigner'}
								<TestSignerCard {currentPkpData} {publicClient} sessionUser={$session.data?.user} />
							{/if}

							{#if activeTab === 'billingSubscriptions'}
								<BillingSubscriptionsCard {authClient} {currentPkpData} />
							{/if}

							{#if activeTab === 'rawDebug'}
								<RawDebugDataCard {allData} />
							{/if}

							<div class="h-4"></div>
						</main>
					</div>
				</div>
			</div>
		</div>
	{:else}
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
