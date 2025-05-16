<script lang="ts">
	import type { Hex, Address, Signature as ViemSignature, TransactionSerializable } from 'viem'; // Added formatUnits
	import { formatUnits } from 'viem'; // ADD as value import
	// import { createEventDispatcher } from 'svelte'; // REMOVED
	import type { ExecuteJsResponse } from '@lit-protocol/types';
	import { example42LitActionCode } from '../wallet/lit-actions/example-42';
	import { fetchCodeFromIpfs } from '$lib/utils/ipfsUtils'; // IMPORT NEW UTILITY

	import type {
		ActionType, // Keep for clarity if needed, though actionRequest.type is primary
		SignMessageActionParams,
		ExecuteLitActionParams,
		SignTransactionActionParams, // Added
		RequestActionDetail,
		ActionResultDetail,
		SimplifiedSignMessageUiParams,
		SimplifiedExecuteLitActionUiParams,
		SimplifiedSignTransactionUiParams, // Added
		ExecuteEventDetail,
		SignTransactionActionResultDetail // Explicitly import for checking type
	} from '../wallet/actionTypes';

	// Props using Svelte 5 runes syntax
	let {
		actionRequest = null as RequestActionDetail | null,
		isProcessing = false,
		processResult = null as ActionResultDetail | null, // This prop receives currentProcessResult from layout
		// ADDED: Callback props for events
		onExecute = (detail: ExecuteEventDetail) => {
			console.warn('[Signer.svelte] onExecute handler not provided. Detail:', detail);
		},
		onClose = () => {
			console.warn('[Signer.svelte] onClose handler not provided.');
		}
	} = $props<{
		actionRequest: RequestActionDetail | null;
		isProcessing?: boolean;
		processResult?: ActionResultDetail | null;
		onExecute?: (detail: ExecuteEventDetail) => void; // ADDED
		onClose?: () => void; // ADDED
	}>();

	$effect(() => {
		console.log(
			'[Signer.svelte $effect] processResult prop changed (snapshot):',
			$state.snapshot(processResult)
		);
		// For non-state (props that might be derived but not $state themselves in parent)
		// If processResult is a direct prop object, snapshot might not be needed or might behave differently.
		// Let's also log it directly if snapshot is problematic for plain objects.
		console.log('[Signer.svelte $effect] processResult prop changed (direct):', processResult);
	});

	// Internal state - No longer need currentTab
	let messageToSignInput = $state('');
	let litActionCodeInput = $state(example42LitActionCode);
	let jsParamsInput = $state(JSON.stringify({ magicNumber: 42 }, null, 2));

	// NEW states for CID-based Lit Action fetching
	let fetchedLitCode = $state<string | null>(null);
	let isFetchingCode = $state(false);
	let fetchCodeError = $state<string | null>(null);

	const jsParamsPlaceholder = '{"param1": "value1", "param2": 123}';

	$effect(() => {
		// $effect is synchronous
		const currentActionReq = actionRequest; // Capture current value for async operation

		async function performLitActionFetch(cid: string) {
			isFetchingCode = true;
			fetchCodeError = null;
			try {
				console.log(`[Signer.svelte] Fetching code for CID: ${cid}`);
				fetchedLitCode = await fetchCodeFromIpfs(cid);
				console.log('[Signer.svelte] Code fetched successfully.');
			} catch (err: any) {
				console.error('[Signer.svelte] Error fetching Lit Action code:', err);
				fetchedLitCode = null;
				fetchCodeError = err.message || 'Failed to fetch Lit Action code.';
			} finally {
				isFetchingCode = false;
			}
		}

		if (currentActionReq) {
			// Reset fetched code states initially for any new request
			fetchedLitCode = null;
			isFetchingCode = false;
			fetchCodeError = null;

			if (currentActionReq.type === 'signMessage') {
				messageToSignInput = (currentActionReq.params as SignMessageActionParams).messageToSign;
			} else if (currentActionReq.type === 'executeLitAction') {
				const params = currentActionReq.params as ExecuteLitActionParams;
				jsParamsInput = JSON.stringify(params.jsParams, null, 2);

				if (params.litActionCid) {
					performLitActionFetch(params.litActionCid); // Call the async function
				} else {
					fetchedLitCode = null;
					fetchCodeError = 'Lit Action CID is missing in the request.';
					isFetchingCode = false; // Ensure this is false if no CID
				}
			} else if (currentActionReq.type === 'signTransaction') {
				// Added
				// No specific input fields for transaction; data comes from actionRequest.params.transaction
				// Display info will also come from actionRequest.params.transactionDisplayInfo
			}
		} else {
			// If actionRequest becomes null, reset all fields
			messageToSignInput = '';
			litActionCodeInput = example42LitActionCode; // Reset this for now
			jsParamsInput = JSON.stringify({ magicNumber: 42 }, null, 2);
			fetchedLitCode = null;
			isFetchingCode = false;
			fetchCodeError = null;
		}
	});

	function requestAction() {
		if (!canProcess || !actionRequest) {
			// Added null check for actionRequest
			alert('Required PKP information or action type is missing. Cannot proceed.');
			return;
		}

		let eventDetail: ExecuteEventDetail;

		if (actionRequest.type === 'signMessage') {
			if (!messageToSignInput.trim()) {
				alert('Please enter a message to sign.');
				return;
			}
			const uiParams: SimplifiedSignMessageUiParams = {
				messageToSign: messageToSignInput.trim()
			};
			eventDetail = { type: 'signMessage', uiParams };
		} else if (actionRequest.type === 'executeLitAction') {
			if (!fetchedLitCode) {
				alert('Please fetch the Lit Action code first.');
				return;
			}
			let jsParamsParsed = {};
			try {
				jsParamsParsed = JSON.parse(jsParamsInput);
			} catch (e) {
				alert('Invalid JSON for JS Params. Please correct it.');
				return;
			}
			const uiParams: SimplifiedExecuteLitActionUiParams = {
				litActionCode: fetchedLitCode,
				jsParams: jsParamsParsed
			};
			eventDetail = { type: 'executeLitAction', uiParams };
		} else if (actionRequest.type === 'signTransaction') {
			// Added
			const params = actionRequest.params as SignTransactionActionParams;
			const uiParams: SimplifiedSignTransactionUiParams = {
				transaction: params.transaction
			};
			eventDetail = { type: 'signTransaction', uiParams };
		} else {
			alert('Invalid action type in request.');
			return;
		}
		// dispatch('execute', eventDetail); // REPLACED
		onExecute(eventDetail); // CALLED PROP
	}

	function clearFieldsAndDispatchClose() {
		messageToSignInput = '';
		litActionCodeInput = example42LitActionCode;
		jsParamsInput = JSON.stringify({ magicNumber: 42 }, null, 2);
		// Also clear fetched code states
		fetchedLitCode = null;
		isFetchingCode = false;
		fetchCodeError = null;
		// dispatch('close'); // REPLACED - Parent handles clearing results and request via this callback
		onClose(); // CALLED PROP
	}

	const canProcess = $derived(
		!!actionRequest &&
			!!actionRequest.params.pkpPublicKey &&
			!!actionRequest.params.passkeyRawId &&
			!!actionRequest.params.passkeyVerifierContractAddress &&
			!!actionRequest.params.pkpTokenId
	);

	// Derived states for displaying results/errors
	const currentErrorMessage = $derived(processResult?.error);
	const currentSignMessageResult = $derived(
		processResult?.type === 'signMessage' ? processResult.signature : null
	);
	const currentLitActionResult = $derived(
		processResult?.type === 'executeLitAction' ? processResult.result : null
	);
	const currentSignTransactionResult = $derived(
		processResult?.type === 'signTransaction' ? processResult.signature : null
	);
	const currentTransactionSendHash = $derived(
		// Added for transaction hash
		processResult?.type === 'signTransaction' &&
			(processResult as SignTransactionActionResultDetail).transactionHash
			? (processResult as SignTransactionActionResultDetail).transactionHash
			: null
	);

	// ADDED: Derived state for transaction receipt status
	const currentTransactionReceipt = $derived(
		processResult?.type === 'signTransaction'
			? (processResult as SignTransactionActionResultDetail).transactionReceipt
			: null
	);

	const transactionStatus = $derived(() => {
		if (!currentTransactionReceipt) return null;
		return currentTransactionReceipt.status === 'success'
			? 'Confirmed (Success)'
			: 'Failed (Reverted on-chain)';
	});

	const showResultView = $derived(
		!!currentSignMessageResult ||
			!!currentLitActionResult ||
			!!currentSignTransactionResult ||
			!!currentTransactionSendHash || // Added
			!!currentTransactionReceipt || // ADDED
			!!currentErrorMessage
	);

	const isSuccessResult = $derived(
		(!!currentSignMessageResult ||
			!!currentLitActionResult ||
			!!currentSignTransactionResult ||
			!!currentTransactionSendHash) && // Keep this group for initial success indication
			(!currentTransactionReceipt || currentTransactionReceipt.status === 'success') // AND (if receipt exists, it must be success)
	);

	const isErrorState = $derived(
		!!currentErrorMessage || currentTransactionReceipt?.status === 'reverted'
	);
</script>

<div class="w-full">
	<!-- DEBUG LINE -->
	<!-- <pre class="text-xs">DEBUG processResult: {JSON.stringify(processResult, null, 2)}</pre> -->

	<!-- Conditional rendering for missing actionRequest or canProcess -->
	{#if !actionRequest}
		<p class="mb-4 text-sm text-orange-600">No action has been requested for this component.</p>
	{:else if !canProcess}
		<p class="mb-4 text-sm text-orange-600">
			Required PKP information (PKP Public Key, Passkey Raw ID, Verifier Address, PKP Token ID) is
			missing within the provided action request.
		</p>
	{/if}

	{#if !showResultView}
		<!-- Sign Message Section -->
		{#if actionRequest?.type === 'signMessage'}
			<div class="mb-4">
				<label for="messageToSignInput" class="text-prussian-blue/80 mb-1 block text-sm font-medium"
					>Message:</label
				>
				<textarea
					id="messageToSignInput"
					rows="4"
					class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 shadow-sm disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none sm:text-sm"
					placeholder="Enter the message you want to sign..."
					bind:value={messageToSignInput}
					disabled={!canProcess || isProcessing}
				></textarea>
			</div>
		{/if}

		<!-- Execute Lit Action Section -->
		{#if actionRequest?.type === 'executeLitAction'}
			<div class="mb-4">
				<label
					for="litActionCidDisplay"
					class="text-prussian-blue/80 mb-1 block text-sm font-medium">Lit Action CID:</label
				>
				<input
					id="litActionCidDisplay"
					type="text"
					class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-slate-100 p-2 font-mono text-xs shadow-sm sm:text-sm"
					value={(actionRequest.params as ExecuteLitActionParams).litActionCid || 'N/A'}
					readonly
				/>
			</div>
			<div class="mb-4">
				<label
					for="litActionCodeDisplay"
					class="text-prussian-blue/80 mb-1 block text-sm font-medium">Lit Action Code:</label
				>
				{#if isFetchingCode}
					<div
						class="text-prussian-blue/80 flex items-center rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
					>
						<div class="spinner-tiny mr-2"></div>
						Fetching code...
					</div>
				{:else if fetchCodeError}
					<div class="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
						Error: {fetchCodeError}
					</div>
				{:else if fetchedLitCode}
					<textarea
						id="litActionCodeDisplay"
						rows="8"
						class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-slate-100 p-2 font-mono text-xs shadow-sm sm:text-sm"
						bind:value={fetchedLitCode}
						readonly
						disabled={true}
					></textarea>
				{:else}
					<div
						class="text-prussian-blue/60 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm italic"
					>
						No code fetched or available.
					</div>
				{/if}
			</div>
			<div class="mb-4">
				<label for="jsParamsInput" class="text-prussian-blue/80 mb-1 block text-sm font-medium"
					>JS Params (JSON):</label
				>
				<textarea
					id="jsParamsInput"
					rows="4"
					class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 font-mono text-xs shadow-sm disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none sm:text-sm"
					placeholder={jsParamsPlaceholder}
					bind:value={jsParamsInput}
					disabled={!canProcess || isProcessing}
				></textarea>
			</div>
		{/if}

		<!-- Sign Transaction Section -->
		{#if actionRequest?.type === 'signTransaction'}
			{@const txParams = actionRequest.params as SignTransactionActionParams}
			{@const displayInfo = txParams.transactionDisplayInfo}
			{@const rawTx = txParams.transaction}
			<div class="mb-4 space-y-3">
				<div>
					<h4 class="text-prussian-blue mb-2 text-base font-semibold">Transaction Details:</h4>

					{#if displayInfo?.description}
						<p class="text-prussian-blue/90 mb-3 text-sm">{displayInfo.description}</p>
					{/if}

					<div class="space-y-1.5 text-xs">
						<div class="flex justify-between">
							<span class="text-prussian-blue/70">From (Your PKP):</span>
							<span class="text-prussian-blue font-mono break-all">{txParams.pkpPublicKey}</span>
						</div>

						<!-- To / Recipient Logic -->
						{#if displayInfo?.recipient}
							<div class="flex justify-between">
								<span class="text-prussian-blue/70">To (Recipient):</span>
								<span class="text-prussian-blue font-mono break-all">
									{displayInfo.recipient}
								</span>
							</div>
							{#if rawTx.to && rawTx.to.toLowerCase() !== displayInfo.recipient.toLowerCase()}
								<div class="flex justify-between">
									<span class="text-prussian-blue/70">Interacting With (Contract):</span>
									<span class="text-prussian-blue font-mono break-all">
										{rawTx.to}
									</span>
								</div>
							{/if}
						{:else if rawTx.to}
							<div class="flex justify-between">
								<span class="text-prussian-blue/70">To:</span>
								<span class="text-prussian-blue font-mono break-all">
									{rawTx.to}
								</span>
							</div>
						{/if}

						<!-- Amount Logic -->
						{#if displayInfo?.amount && displayInfo?.tokenSymbol}
							<div class="flex justify-between">
								<span class="text-prussian-blue/70">Amount:</span>
								<span class="text-prussian-blue font-mono">
									{displayInfo.amount}
									{displayInfo.tokenSymbol}
								</span>
							</div>
							{#if typeof rawTx.value === 'bigint' && rawTx.value > 0n}
								<div class="flex justify-between">
									<span class="text-prussian-blue/70">Value (ETH Sent Alongside):</span>
									<span class="text-prussian-blue font-mono">
										{formatUnits(rawTx.value, 18)} ETH
									</span>
								</div>
							{/if}
						{:else if typeof rawTx.value === 'bigint'}
							<div class="flex justify-between">
								<span class="text-prussian-blue/70">Amount:</span>
								<span class="text-prussian-blue font-mono">
									{rawTx.value > 0n ? `${formatUnits(rawTx.value, 18)} ETH` : '0 ETH'}
								</span>
							</div>
						{/if}

						{#if rawTx.gas}
							<div class="flex justify-between">
								<span class="text-prussian-blue/70">Estimated Gas Limit:</span>
								<span class="text-prussian-blue font-mono">{rawTx.gas.toString()}</span>
							</div>
						{/if}
						{#if rawTx.nonce !== undefined}
							<div class="flex justify-between">
								<span class="text-prussian-blue/70">Nonce:</span>
								<span class="text-prussian-blue font-mono">{rawTx.nonce.toString()}</span>
							</div>
						{/if}
					</div>

					{#if !displayInfo?.description}
						<!-- Show raw if no custom description -->
						<details class="mt-3 text-xs">
							<summary class="text-prussian-blue/70 hover:text-prussian-blue cursor-pointer"
								>Show Raw Transaction Data</summary
							>
							<pre
								class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2.5 text-[0.7rem] leading-snug">{JSON.stringify(
									rawTx,
									(key, value) => (typeof value === 'bigint' ? value.toString() + 'n' : value),
									2
								)}</pre>
						</details>
					{/if}
				</div>
			</div>
		{/if}
	{:else}
		<!-- Result display section, ensure it has top margin if needed -->
		{#if currentSignMessageResult}
			<div class="mt-4">
				<h4 class="text-prussian-blue text-sm font-medium">Signature:</h4>
				<pre
					class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-words whitespace-pre-wrap">{currentSignMessageResult}</pre>
			</div>
		{/if}

		{#if currentLitActionResult}
			<div class="mt-4">
				<h4 class="text-prussian-blue text-sm font-medium">Lit Action Result:</h4>
				<pre
					class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-words whitespace-pre-wrap">{JSON.stringify(
						currentLitActionResult,
						null,
						2
					)}</pre>
			</div>
		{/if}

		{#if currentSignTransactionResult}
			<div class="mt-4">
				<h4 class="text-prussian-blue text-sm font-medium">Transaction Signature:</h4>
				<pre
					class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-words whitespace-pre-wrap">{JSON.stringify(
						currentSignTransactionResult,
						(key, value) => (typeof value === 'bigint' ? value.toString() + 'n' : value),
						2
					)}</pre>
			</div>
		{/if}

		{#if currentTransactionSendHash}
			<div class="mt-4">
				<h4 class="text-prussian-blue text-sm font-medium">Transaction Sent:</h4>
				<p class="text-prussian-blue/80 mb-1 text-xs">
					The transaction has been broadcast to the network.
				</p>
				<h5 class="text-prussian-blue/90 text-xs font-medium">Transaction Hash:</h5>
				<pre
					class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-words whitespace-pre-wrap">{currentTransactionSendHash}</pre>
				<!-- Optional: Link to block explorer -->
				<a
					href={`https://gnosis.blockscout.com/tx/${currentTransactionSendHash}`}
					target="_blank"
					rel="noopener noreferrer"
					class="text-persian-orange hover:text-persian-orange/80 mt-1 block text-xs underline"
				>
					View on Gnosis Blockscout
				</a>
			</div>
		{/if}

		{#if transactionStatus}
			<div class="mt-4">
				<h5 class="text-prussian-blue/90 text-sm font-medium">On-Chain Status:</h5>
				<p
					class="text-xs {currentTransactionReceipt?.status === 'success'
						? 'text-green-600'
						: 'text-red-600'}"
				>
					{transactionStatus}
				</p>
				{#if currentTransactionReceipt?.status === 'reverted' && currentTransactionReceipt.gasUsed}
					<p class="text-xs text-red-500/80">
						(Gas Used: {currentTransactionReceipt.gasUsed.toString()})
					</p>
				{/if}
			</div>
		{/if}

		{#if currentErrorMessage}
			<div class="mt-4 rounded-md bg-red-50 p-3">
				<p class="text-sm text-red-700">
					<span class="font-medium">Error:</span>
					{currentErrorMessage}
				</p>
			</div>
		{/if}
	{/if}

	<!-- MODIFIED Button Container -->
	<div
		class="flex items-center pt-2
		{isSuccessResult && !isErrorState ? 'justify-center' : 'justify-between'}"
	>
		{#if !showResultView}
			<!-- Input Mode -->
			<button
				onclick={onClose}
				disabled={isProcessing}
				class="rounded-2xl border border-[var(--color-rosy-brown)] px-4 py-2 text-sm font-medium text-[var(--color-rosy-brown)] transition-colors hover:bg-[var(--color-rosy-brown)]/10 focus:ring-2 focus:ring-[var(--color-rosy-brown)]/50 focus:outline-none disabled:border-slate-300 disabled:text-slate-400 disabled:opacity-50 disabled:hover:bg-transparent"
			>
				Decline
			</button>

			<button
				onclick={requestAction}
				disabled={!canProcess ||
					!actionRequest ||
					(actionRequest.type === 'signMessage' && !messageToSignInput.trim()) ||
					(actionRequest.type === 'executeLitAction' &&
						(!fetchedLitCode || !jsParamsInput.trim())) ||
					(actionRequest.type === 'signTransaction' &&
						!(actionRequest.params as SignTransactionActionParams).transaction) || // Basic check for transaction presence
					isProcessing}
				class="rounded-2xl px-4 py-2 text-sm font-medium transition-colors
					   {!canProcess ||
				!actionRequest ||
				(actionRequest.type === 'signMessage' && !messageToSignInput.trim()) ||
				(actionRequest.type === 'executeLitAction' && (!fetchedLitCode || !jsParamsInput.trim())) ||
				(actionRequest.type === 'signTransaction' &&
					!(actionRequest.params as SignTransactionActionParams).transaction) ||
				isProcessing
					? 'cursor-not-allowed bg-slate-300 text-slate-500'
					: 'bg-prussian-blue text-linen hover:bg-opacity-90 focus:ring-persian-orange focus:ring-2 focus:outline-none'}"
			>
				{#if isProcessing}
					<span class="spinner-tiny mr-2"></span> Processing...
				{:else if actionRequest?.type === 'signMessage'}
					Sign Message
				{:else if actionRequest?.type === 'executeLitAction'}
					Execute Action
				{:else if actionRequest?.type === 'signTransaction'}
					Sign Transaction
				{:else}
					Perform Action
				{/if}
			</button>
		{:else if isSuccessResult && !isErrorState}
			<!-- Success Mode -->
			<button
				onclick={onClose}
				class="bg-prussian-blue text-linen hover:bg-opacity-90 focus:ring-persian-orange rounded-2xl border border-[var(--color-prussian-blue)] px-6 py-2 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
			>
				Close
			</button>
		{:else if isErrorState}
			<!-- Error Mode -->
			<button
				onclick={onClose}
				class="focus:ring-persian-orange/50 rounded-2xl border border-[var(--color-prussian-blue)] px-4 py-2 text-sm font-medium text-[var(--color-prussian-blue)] transition-colors hover:bg-[var(--color-prussian-blue)]/10 focus:ring-2 focus:outline-none"
			>
				Retry
			</button>
			<button
				onclick={onClose}
				class="rounded-2xl border border-[var(--color-rosy-brown)] px-4 py-2 text-sm font-medium text-[var(--color-rosy-brown)] transition-colors hover:bg-[var(--color-rosy-brown)]/10 focus:ring-2 focus:ring-[var(--color-rosy-brown)]/50 focus:outline-none"
			>
				Close
			</button>
		{/if}
	</div>
</div>

<style>
	.spinner-tiny {
		display: inline-block;
		border: 2px solid currentColor;
		border-right-color: transparent;
		width: 0.8em;
		height: 0.8em;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		vertical-align: text-bottom;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
