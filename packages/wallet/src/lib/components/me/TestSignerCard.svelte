<script lang="ts">
	import { getContext } from 'svelte';
	import type { ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';
	import type { PublicClient, Address, TransactionSerializableEIP1559, Hex } from 'viem';
	import { encodeFunctionData, parseUnits, isAddress, getAddress, erc20Abi } from 'viem';
	import { gnosis } from 'viem/chains';
	import { shortAddress } from '$lib/utils/addressUtils';
	import type { SignTransactionActionParams } from '$lib/wallet/actionTypes';

	// Props
	let { currentPkpData, publicClient, sessionUser } = $props<{
		currentPkpData: ClientPkpPasskey | null;
		publicClient: PublicClient | null;
		sessionUser: any; // Should match the type of $session.data.user
	}>();

	// Context for Modals
	const openSignMessageModalFromLayout =
		getContext<(message?: string) => void>('openSignMessageModal');
	const openExecuteLitActionModalFromLayout = getContext<
		(cid?: string, jsParams?: Record<string, unknown>) => void
	>('openExecuteLitActionModal');
	const openSignTransactionModalFromLayout = getContext<
		(
			transaction: TransactionSerializableEIP1559,
			displayInfo?: SignTransactionActionParams['transactionDisplayInfo']
		) => void
	>('openSignTransactionModal');

	// Component State
	let customMessageText = $state('');
	let customLitActionCidText = $state('local:example-42.js');
	let customJsParamsText = $state(JSON.stringify({ magicNumber: 42 }, null, 2));
	const jsParamsPlaceholderString = '{"key": "value"}';

	let isTestTransactionSigning = $state(false);
	let testTransactionError = $state<string | null>(null);

	let sahelRecipientAddressInput = $state<string>('0x75e4Bf850Eec4c15801D16b90D259b5594b449c2');
	let sahelAmountInput = $state<string>('0.01');

	// Functions
	function handleInitiateSignMessage() {
		const message = customMessageText.trim() || undefined;
		openSignMessageModalFromLayout(message);
	}

	function handleInitiateLitAction() {
		const cid = customLitActionCidText.trim() || undefined;
		let jsParams: Record<string, unknown> | undefined = undefined;
		try {
			if (customJsParamsText.trim()) {
				jsParams = JSON.parse(customJsParamsText.trim());
			}
		} catch (e) {
			alert('Invalid JSON in JS Params. Please correct it or leave it empty for default.');
			return;
		}
		openExecuteLitActionModalFromLayout(cid, jsParams);
	}

	async function handleInitiateSahelTokenTransferSigning() {
		if (!publicClient || !currentPkpData?.pkpEthAddress) {
			testTransactionError = 'Public client or PKP ETH address not available.';
			return;
		}

		const recipientString = sahelRecipientAddressInput.trim();
		if (!recipientString || !isAddress(recipientString)) {
			testTransactionError = 'Invalid recipient address. Please enter a valid Ethereum address.';
			return;
		}
		const recipientAddress: Address = getAddress(recipientString);

		const amountString = sahelAmountInput.trim();
		if (!amountString || isNaN(parseFloat(amountString)) || parseFloat(amountString) <= 0) {
			testTransactionError = 'Invalid amount. Please enter a positive number.';
			return;
		}

		isTestTransactionSigning = true;
		testTransactionError = null;

		try {
			const pkpEthAddress = currentPkpData.pkpEthAddress as Address;
			const SAHEL_TOKEN_ADDRESS_RAW = '0x181CA58494Fc2C75FF805DEAA32ecD78377e135e';
			const SAHEL_TOKEN_ADDRESS: Address = getAddress(SAHEL_TOKEN_ADDRESS_RAW);

			const amountToSend = parseUnits(amountString, 18);

			const nonce = await publicClient.getTransactionCount({
				address: pkpEthAddress,
				blockTag: 'pending'
			});

			const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas();
			if (!maxFeePerGas || !maxPriorityFeePerGas) {
				throw new Error(
					'Could not estimate gas fees (maxFeePerGas or maxPriorityFeePerGas is null).'
				);
			}

			const encodedTransferData = encodeFunctionData({
				abi: erc20Abi,
				functionName: 'transfer',
				args: [recipientAddress, amountToSend]
			});

			const gas = await publicClient.estimateGas({
				account: pkpEthAddress,
				to: SAHEL_TOKEN_ADDRESS,
				data: encodedTransferData,
				value: 0n
			});

			const unsignedTx: TransactionSerializableEIP1559 = {
				to: SAHEL_TOKEN_ADDRESS,
				data: encodedTransferData,
				nonce: nonce,
				gas: gas,
				maxFeePerGas: maxFeePerGas,
				maxPriorityFeePerGas: maxPriorityFeePerGas,
				chainId: gnosis.id,
				type: 'eip1559',
				value: 0n
			};

			console.log('[TestSignerCard] Unsigned Transaction Prepared:', unsignedTx);

			// const userForProfileImage = sessionUser; // Already available via props

			openSignTransactionModalFromLayout(unsignedTx, {
				amount: amountString,
				tokenSymbol: 'SAHEL',
				recipientAddress: recipientAddress,
				description: `Transfer ${amountString} SAHEL to ${shortAddress(recipientAddress)}`
			});
		} catch (err: any) {
			console.error('[TestSignerCard] Error preparing Sahel token transfer:', err);
			testTransactionError = `Failed to prepare transaction: ${err.message || 'Unknown error'}`;
		} finally {
			isTestTransactionSigning = false;
		}
	}
</script>

<div class="bg-timberwolf-1/40 rounded-lg p-6 shadow">
	<h3 class="font-playfair-display text-prussian-blue mb-6 text-2xl">Test Signer Functionality</h3>

	{#if !currentPkpData?.pkpEthAddress}
		<div class="mb-6 rounded-md border border-orange-300 bg-orange-50 p-4">
			<p class="text-sm text-orange-700">
				A Wallet (PKP) is required to test signing features. Please create or ensure your wallet is
				set up.
			</p>
		</div>
	{/if}

	<div class="space-y-8">
		<!-- Section for Sign Message -->
		<section>
			<h4 class="text-prussian-blue/90 mb-3 text-lg font-semibold">1. Sign a Custom Message</h4>
			<div class="mb-4">
				<label for="customMessageInput" class="text-prussian-blue/80 mb-1 block text-sm font-medium"
					>Message to Sign:</label
				>
				<textarea
					id="customMessageInput"
					rows="3"
					class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 shadow-sm disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none sm:text-sm"
					placeholder="Enter your custom message here, or leave blank for default."
					bind:value={customMessageText}
					disabled={!currentPkpData?.pkpEthAddress}
				></textarea>
			</div>
			<button
				onclick={handleInitiateSignMessage}
				disabled={!currentPkpData?.pkpEthAddress}
				class="bg-persian-orange text-linen focus:ring-persian-orange/70 hover:bg-opacity-90 rounded-lg px-5 py-2.5 text-sm font-medium shadow-md transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-400"
			>
				Initiate Sign Message
			</button>
		</section>

		<!-- Section for Execute Lit Action -->
		<section>
			<h4 class="text-prussian-blue/90 mb-3 text-lg font-semibold">2. Execute a Lit Action</h4>
			<div class="mb-4">
				<label for="customLitActionCid" class="text-prussian-blue/80 mb-1 block text-sm font-medium"
					>Lit Action CID (or local path):</label
				>
				<input
					type="text"
					id="customLitActionCid"
					class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 shadow-sm disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none sm:text-sm"
					placeholder="Enter Lit Action IPFS CID or 'local:action-name.js'"
					bind:value={customLitActionCidText}
					disabled={!currentPkpData?.pkpEthAddress}
				/>
			</div>
			<div class="mb-4">
				<label for="customJsParams" class="text-prussian-blue/80 mb-1 block text-sm font-medium"
					>JS Params (JSON format):</label
				>
				<textarea
					id="customJsParams"
					rows="4"
					class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 font-mono text-xs shadow-sm disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none sm:text-sm"
					placeholder={jsParamsPlaceholderString}
					bind:value={customJsParamsText}
					disabled={!currentPkpData?.pkpEthAddress}
				></textarea>
			</div>
			<button
				onclick={handleInitiateLitAction}
				disabled={!currentPkpData?.pkpEthAddress}
				class="bg-persian-orange text-linen focus:ring-persian-orange/70 hover:bg-opacity-90 rounded-lg px-5 py-2.5 text-sm font-medium shadow-md transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-400"
			>
				Initiate Lit Action Execution
			</button>
		</section>

		<!-- Section for Sign Transaction -->
		<section>
			<h4 class="text-prussian-blue/90 mb-3 text-lg font-semibold">
				3. Sign a Transaction (Sahel Token Transfer)
			</h4>
			<p class="text-prussian-blue/70 mb-3 text-xs">
				This will prepare a transaction to transfer SAHEL token on Gnosis chain and request your PKP
				to sign it.
			</p>

			<div class="mb-4 space-y-3">
				<div>
					<label
						for="sahelRecipientAddress"
						class="text-prussian-blue/80 mb-1 block text-sm font-medium">Recipient Address:</label
					>
					<input
						id="sahelRecipientAddress"
						type="text"
						class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 shadow-sm disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none sm:text-sm"
						placeholder="0x..."
						bind:value={sahelRecipientAddressInput}
						disabled={!currentPkpData?.pkpEthAddress || isTestTransactionSigning}
					/>
				</div>
				<div>
					<label for="sahelAmount" class="text-prussian-blue/80 mb-1 block text-sm font-medium"
						>Amount (SAHEL):</label
					>
					<input
						id="sahelAmount"
						type="text"
						inputmode="decimal"
						pattern="^[0-9]*[.,]?[0-9]*$"
						class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 shadow-sm disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none sm:text-sm"
						placeholder="0.01"
						bind:value={sahelAmountInput}
						disabled={!currentPkpData?.pkpEthAddress || isTestTransactionSigning}
					/>
				</div>
			</div>

			<button
				onclick={handleInitiateSahelTokenTransferSigning}
				disabled={!currentPkpData?.pkpEthAddress ||
					!publicClient ||
					isTestTransactionSigning ||
					!sahelRecipientAddressInput.trim() ||
					isTestTransactionSigning}
				class="bg-persian-orange text-linen focus:ring-persian-orange/70 hover:bg-opacity-90 rounded-lg px-5 py-2.5 text-sm font-medium shadow-md transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-400"
			>
				{#if isTestTransactionSigning}
					<span class="spinner-tiny mr-2"></span> Preparing Transaction...
				{:else}
					Initiate Sahel Token Transfer Signing
				{/if}
			</button>
			{#if testTransactionError}
				<p class="mt-3 text-xs text-red-600">Error: {testTransactionError}</p>
			{/if}
		</section>
	</div>
</div>

<style>
	/* For spinner-tiny if used - ensure this matches parent or is defined if needed */
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

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
