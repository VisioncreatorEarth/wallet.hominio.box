<script lang="ts">
	import type {
		Hex,
		Address,
		Signature as ViemSignature,
		TransactionSerializable,
		TransactionReceipt
	} from 'viem'; // Added formatUnits
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
		SignTransactionActionResultDetail, // Explicitly import for checking type
		BaseActionParams, // ADDED IMPORT
		DisplayIdentity // IMPORT DisplayIdentity
	} from '../wallet/actionTypes';
	import {
		shortAddress,
		resolvePkpIdentityInfo,
		type MinimalSessionData,
		type PkpIdentityInfo
	} from '$lib/utils/addressUtils'; // IMPORT shortAddress, resolvePkpIdentityInfo, MinimalSessionData, PkpIdentityInfo
	import { authClient } from '$lib/client/betterauth-client'; // IMPORT authClient

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

	// Internal state
	let messageToSignInput = $state('');
	let litActionCodeInput = $state(example42LitActionCode); // This is more of a default/fallback, actual code comes from fetchedLitCode
	let jsParamsInput = $state(JSON.stringify({ magicNumber: 42 }, null, 2));

	// NEW states for CID-based Lit Action fetching
	let fetchedLitCode = $state<string | null>(null);
	let isFetchingCode = $state(false);
	let fetchCodeError = $state<string | null>(null);

	const jsParamsPlaceholder = '{"param1": "value1", "param2": 123}';

	// ADDED: State for active tab
	let activeDetailTab = $state<'info' | 'details' | 'json'>('info');

	// NEW: Session store for identity resolution
	const session = authClient.useSession();

	// NEW: State for resolved identities for signTransaction
	let resolvedSenderIdentity = $state<PkpIdentityInfo | null>(null);
	let resolvedRecipientIdentity = $state<PkpIdentityInfo | null>(null);

	// Helper for JSON.stringify with BigInt support
	function bigIntReplacer(key: string, value: any) {
		if (typeof value === 'bigint') {
			return value.toString() + 'n';
		}
		return value;
	}

	$effect(() => {
		const currentActionReq = actionRequest;
		// Reset tab only if not already in a result view, or if actionRequest itself changes
		if (
			!showResultView ||
			(currentActionReq && currentActionReq !== $state.snapshot(actionRequest))
		) {
			activeDetailTab = 'info';
		}

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
			fetchedLitCode = null;
			isFetchingCode = false;
			fetchCodeError = null;

			if (currentActionReq.type === 'signMessage') {
				messageToSignInput = (currentActionReq.params as SignMessageActionParams).messageToSign;
			} else if (currentActionReq.type === 'executeLitAction') {
				const params = currentActionReq.params as ExecuteLitActionParams;
				jsParamsInput = JSON.stringify(params.jsParams, null, 2);
				if (params.litActionCid && !params.litActionCid.startsWith('local:')) {
					performLitActionFetch(params.litActionCid);
				} else if (params.litActionCid?.startsWith('local:')) {
					if (params.litActionCid === 'local:example-42.js') {
						fetchedLitCode = example42LitActionCode;
					} else {
						fetchedLitCode =
							'// Code for local actions is embedded in the application and not fetched.';
					}
				} else {
					fetchCodeError = 'Lit Action CID is missing or invalid.';
				}
			}
		} else {
			messageToSignInput = '';
			jsParamsInput = JSON.stringify({ magicNumber: 42 }, null, 2);
			fetchedLitCode = null;
			isFetchingCode = false;
			fetchCodeError = null;
		}

		// NEW: Effect for resolving identities when actionRequest changes for signTransaction
		if (currentActionReq && currentActionReq.type === 'signTransaction') {
			const params = currentActionReq.params as SignTransactionActionParams;
			const displayInfo = params.transactionDisplayInfo;
			const senderIdentifier = displayInfo?.senderIdentifier;
			const recipientEthAddress = displayInfo?.recipientAddress;
			const minimalSession = $session.data
				? ({ user: $session.data.user } as MinimalSessionData)
				: null;

			if (senderIdentifier) {
				// Assuming senderIdentifier is an ETH address based on how it's populated in +layout.svelte
				resolvedSenderIdentity = resolvePkpIdentityInfo(
					senderIdentifier as Address,
					'ethAddress',
					minimalSession
				);
			} else {
				resolvedSenderIdentity = null;
			}

			if (recipientEthAddress) {
				resolvedRecipientIdentity = resolvePkpIdentityInfo(
					recipientEthAddress,
					'ethAddress',
					minimalSession
				);
			} else {
				resolvedRecipientIdentity = null;
			}
		} else if (!currentActionReq || currentActionReq.type !== 'signTransaction') {
			// Clear if not a signTransaction action or if actionRequest is cleared
			resolvedSenderIdentity = null;
			resolvedRecipientIdentity = null;
		}
	});

	function requestAction() {
		if (!canProcess || !actionRequest) {
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
			const params = actionRequest.params as ExecuteLitActionParams;
			let codeToExecute = fetchedLitCode;
			if (
				params.litActionCid?.startsWith('local:') &&
				params.litActionCid === 'local:example-42.js'
			) {
				codeToExecute = example42LitActionCode;
			} else if (params.litActionCid?.startsWith('local:')) {
				codeToExecute = ''; // Placeholder for other local actions, service should handle it
			}

			if (!codeToExecute && !params.litActionCid?.startsWith('local:')) {
				alert(
					'Lit Action code is not available. Please ensure CID is correct or it is a local action.'
				);
				return;
			}
			let jsParamsParsed = {};
			try {
				jsParamsParsed = JSON.parse(jsParamsInput);
			} catch (e) {
				alert('Invalid JSON for JS Params. Please correct it.');
				return;
			}
			eventDetail = {
				type: 'executeLitAction',
				uiParams: { litActionCode: codeToExecute || '', jsParams: jsParamsParsed }
			};
		} else if (actionRequest.type === 'signTransaction') {
			const params = actionRequest.params as SignTransactionActionParams;
			const uiParams: SimplifiedSignTransactionUiParams = {
				transaction: params.transaction
			};
			eventDetail = { type: 'signTransaction', uiParams };
		} else {
			alert('Invalid action type in request.');
			return;
		}
		onExecute(eventDetail);
	}

	function clearFieldsAndDispatchClose() {
		messageToSignInput = '';
		jsParamsInput = JSON.stringify({ magicNumber: 42 }, null, 2);
		fetchedLitCode = null;
		isFetchingCode = false;
		fetchCodeError = null;
		activeDetailTab = 'info'; // Reset tab
		onClose();
	}

	const canProcess = $derived(
		!!actionRequest &&
			!!actionRequest.params.pkpPublicKey &&
			!!actionRequest.params.passkeyRawId &&
			!!actionRequest.params.passkeyVerifierContractAddress &&
			!!actionRequest.params.pkpTokenId
	);

	const currentErrorMessage = $derived(processResult?.error);
	const currentSignMessageResultSignature = $derived(
		processResult?.type === 'signMessage' ? processResult.signature : null
	);
	const currentLitActionResultObject = $derived(
		processResult?.type === 'executeLitAction' ? processResult.result : null
	);
	const currentSignTransactionResultSignature = $derived(
		processResult?.type === 'signTransaction' ? processResult.signature : null
	);
	const currentTransactionSendHash = $derived(
		processResult?.type === 'signTransaction' &&
			(processResult as SignTransactionActionResultDetail).transactionHash
			? (processResult as SignTransactionActionResultDetail).transactionHash
			: null
	);
	const currentTransactionReceipt = $derived(
		processResult?.type === 'signTransaction'
			? (processResult as SignTransactionActionResultDetail).transactionReceipt
			: null
	);

	// Changed to use $derived.by for explicit derived store definition
	let transactionOutcomeForDisplay = $derived.by(() => {
		if (actionRequest?.type !== 'signTransaction' || !currentTransactionReceipt) {
			return null;
		}
		if (currentTransactionReceipt.status === 'success') {
			return { status: 'success', message: 'Confirmed (Success)' };
		} else if (currentTransactionReceipt.status === 'reverted') {
			return { status: 'reverted', message: 'Failed (Reverted on-chain)' };
		}
		return null;
	});

	const showResultView = $derived(
		!!currentSignMessageResultSignature ||
			!!currentLitActionResultObject ||
			!!currentTransactionSendHash ||
			!!currentErrorMessage
	);

	const isSuccessResult = $derived(
		(!!currentSignMessageResultSignature ||
			!!currentLitActionResultObject ||
			!!currentTransactionSendHash) &&
			(!currentTransactionReceipt || currentTransactionReceipt.status === 'success') &&
			!currentErrorMessage
	);

	const isErrorState = $derived(
		!!currentErrorMessage || currentTransactionReceipt?.status === 'reverted'
	);
</script>

<div class="w-full">
	{#if !actionRequest}
		<p class="mb-4 text-sm text-orange-600">No action has been requested for this component.</p>
	{:else if !canProcess}
		<p class="mb-4 text-sm text-orange-600">
			Required PKP information (PKP Public Key, Passkey Raw ID, Verifier Address, PKP Token ID) is
			missing within the provided action request.
		</p>
	{/if}

	{#if !showResultView && actionRequest && canProcess}
		<!-- Tab Navigation -->
		<div class="mb-4 flex border-b border-slate-200">
			<button
				onclick={() => (activeDetailTab = 'info')}
				class="{activeDetailTab === 'info'
					? 'border-persian-orange text-persian-orange'
					: 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'} border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap focus:outline-none"
			>
				Info
			</button>
			<button
				onclick={() => (activeDetailTab = 'details')}
				class="{activeDetailTab === 'details'
					? 'border-persian-orange text-persian-orange'
					: 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'} border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap focus:outline-none"
			>
				Details
			</button>
			<button
				onclick={() => (activeDetailTab = 'json')}
				class="{activeDetailTab === 'json'
					? 'border-persian-orange text-persian-orange'
					: 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'} border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap focus:outline-none"
			>
				JSON
			</button>
		</div>

		<!-- Tab Content Area -->
		<div class="mb-4">
			<!-- Sign Message Tabs -->
			{#if actionRequest.type === 'signMessage'}
				{@const currentParams = actionRequest.params as SignMessageActionParams}
				{#if activeDetailTab === 'info'}
					{#if showResultView}
						<!-- SignMessage Result: Info -->
						<h4 class="text-prussian-blue mb-2 text-base font-semibold">Message Signed</h4>
						{#if currentSignMessageResultSignature}
							<p class="text-prussian-blue/80 mb-1 text-xs">
								The message has been successfully signed.
							</p>
							<h5 class="text-prussian-blue/90 text-xs font-medium">Signature:</h5>
							<pre
								class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-words whitespace-pre-wrap">{currentSignMessageResultSignature}</pre>
						{:else if currentErrorMessage}
							<p class="text-sm text-red-600">Error: {currentErrorMessage}</p>
						{/if}
					{:else}
						<!-- SignMessage Pre-Sign: Info -->
						<div>
							<label
								for="messageToSignInput"
								class="text-prussian-blue/80 mb-1 block text-sm font-medium">Message:</label
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
				{/if}
				{#if activeDetailTab === 'details'}
					{#if showResultView}
						<!-- SignMessage Result: Details -->
						<h4 class="text-prussian-blue mb-2 text-base font-semibold">Original Message</h4>
						<pre
							class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2.5 text-sm leading-snug break-words whitespace-pre-wrap">{currentParams.messageToSign}</pre>
					{:else}
						<!-- SignMessage Pre-Sign: Details -->
						<div>
							<h4 class="text-prussian-blue mb-2 text-base font-semibold">Message Content:</h4>
							<pre
								class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2.5 text-sm leading-snug break-words whitespace-pre-wrap">{messageToSignInput ||
									'(empty message)'}</pre>
						</div>
					{/if}
				{/if}
				{#if activeDetailTab === 'json'}
					{#if showResultView}
						<!-- SignMessage Result: JSON -->
						<h4 class="text-prussian-blue mb-2 text-base font-semibold">Result Payload:</h4>
						<pre
							class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2.5 text-[0.7rem] leading-snug">{JSON.stringify(
								{ signature: currentSignMessageResultSignature, error: currentErrorMessage },
								bigIntReplacer,
								2
							)}</pre>
					{:else}
						<!-- SignMessage Pre-Sign: JSON -->
						<div>
							<h4 class="text-prussian-blue mb-2 text-base font-semibold">
								Signing Payload (UTF-8 String):
							</h4>
							<pre
								class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2.5 text-[0.7rem] leading-snug">{JSON.stringify(
									{ messageToSign: messageToSignInput },
									null,
									2
								)}</pre>
						</div>
					{/if}
				{/if}
			{/if}

			<!-- Execute Lit Action Tabs -->
			{#if actionRequest.type === 'executeLitAction'}
				{@const currentParams = actionRequest.params as ExecuteLitActionParams}
				{#if activeDetailTab === 'info'}
					{#if showResultView}
						<!-- LitAction Result: Info -->
						<h4 class="text-prussian-blue mb-2 text-base font-semibold">Lit Action Executed</h4>
						{#if currentLitActionResultObject}
							<p class="text-prussian-blue/80 mb-1 text-xs">The Lit Action has been executed.</p>
							<h5 class="text-prussian-blue/90 text-xs font-medium">Response Summary:</h5>
							<pre
								class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-words whitespace-pre-wrap">{typeof currentLitActionResultObject.response ===
								'object'
									? JSON.stringify(currentLitActionResultObject.response, bigIntReplacer, 2)
									: currentLitActionResultObject.response || 'No direct response output.'}</pre>
						{:else if currentErrorMessage}
							<p class="text-sm text-red-600">Error: {currentErrorMessage}</p>
						{/if}
					{:else}
						<!-- LitAction Pre-Sign: Info -->
						<div class="space-y-4">
							<div>
								<label
									for="litActionCidDisplay"
									class="text-prussian-blue/80 mb-1 block text-sm font-medium"
									>Lit Action CID:</label
								>
								<input
									id="litActionCidDisplay"
									type="text"
									class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-slate-100 p-2 font-mono text-xs shadow-sm sm:text-sm"
									value={currentParams.litActionCid || 'N/A'}
									readonly
								/>
							</div>
							<div>
								<label
									for="jsParamsInput"
									class="text-prussian-blue/80 mb-1 block text-sm font-medium"
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
						</div>
					{/if}
				{/if}
				{#if activeDetailTab === 'details'}
					{#if showResultView}
						<h4 class="text-prussian-blue mb-2 text-base font-semibold">Execution Logs:</h4>
						{#if currentLitActionResultObject?.logs}
							<pre
								class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2.5 text-xs leading-snug break-words whitespace-pre-wrap">{currentLitActionResultObject.logs}</pre>
						{:else}
							<p class="text-prussian-blue/70 text-sm italic">No logs available.</p>
						{/if}
					{:else}
						<!-- LitAction Pre-Sign: Details -->
						<div class="space-y-4">
							<div>
								<h4 class="text-prussian-blue mb-2 text-base font-semibold">Lit Action Code:</h4>
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
										No code fetched or available. (If this is a 'local:' action, code is embedded in
										service).
									</div>
								{/if}
							</div>
						</div>
					{/if}
				{/if}
				{#if activeDetailTab === 'json'}
					{#if showResultView}
						<h4 class="text-prussian-blue mb-2 text-base font-semibold">Full Result Payload:</h4>
						<pre
							class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2.5 text-[0.7rem] leading-snug">{JSON.stringify(
								currentLitActionResultObject
									? { ...currentLitActionResultObject, error: currentErrorMessage }
									: { error: currentErrorMessage },
								bigIntReplacer,
								2
							)}</pre>
					{:else}
						<div>
							<h4 class="text-prussian-blue mb-2 text-base font-semibold">JS Params Payload:</h4>
							<pre
								class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2.5 text-[0.7rem] leading-snug">{(() => {
									try {
										return JSON.stringify(JSON.parse(jsParamsInput), null, 2);
									} catch (e) {
										return jsParamsInput;
									}
								})()}</pre>
						</div>
					{/if}
				{/if}
			{/if}

			<!-- Sign Transaction Tabs -->
			{#if actionRequest.type === 'signTransaction'}
				{@const currentParams = actionRequest.params as SignTransactionActionParams}
				{@const displayInfo = currentParams.transactionDisplayInfo}
				{@const rawTx = currentParams.transaction}
				{@const fallbackRecipientAddress = '0x75e4Bf850Eec4c15801D16b90D259b5594b449c2' as Address}

				{#if activeDetailTab === 'info'}
					{#if showResultView}
						<!-- SignTransaction Result: Info -->
						<div class="space-y-4">
							<h4 class="text-prussian-blue mb-1 text-lg font-semibold">
								{isErrorState ? 'Transaction Failed' : 'Transaction Processed'}
							</h4>

							{#if displayInfo?.amount && displayInfo?.tokenSymbol && resolvedSenderIdentity && resolvedRecipientIdentity}
								<div
									class="my-2 flex items-center justify-between space-x-2 rounded-lg bg-slate-50 p-3 py-4 shadow-sm"
								>
									<div class="flex flex-1 flex-col items-center space-y-1 text-center">
										{#if resolvedSenderIdentity.imageUrl}
											<img
												src={resolvedSenderIdentity.imageUrl}
												alt={resolvedSenderIdentity.name || 'Sender'}
												class="h-10 w-10 rounded-full object-cover ring-1 ring-slate-300"
											/>
										{:else}
											<div
												class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-base font-semibold text-slate-500 ring-1 ring-slate-300"
											>
												{resolvedSenderIdentity.name?.charAt(0)?.toUpperCase() || 'S'}
											</div>{/if}
										<span class="text-prussian-blue/90 text-xs font-medium"
											>{resolvedSenderIdentity.name ||
												(resolvedSenderIdentity.isCurrentUserPrimaryPkp ? 'You' : 'Sender')}</span
										>
										<span
											class="font-mono text-[0.65rem] leading-tight text-slate-500"
											title={resolvedSenderIdentity.address}
											>{resolvedSenderIdentity.shortAddress ||
												shortAddress(resolvedSenderIdentity.address)}</span
										>
									</div>
									<div
										class="flex flex-shrink-0 items-center justify-center space-x-1.5 px-1 text-center"
									>
										<span class="text-persian-orange text-xl leading-none font-bold">→</span>
										<div class="flex flex-col items-center">
											<span class="text-prussian-blue text-base leading-tight font-semibold"
												>{displayInfo.amount}</span
											>
											<span class="text-xs leading-tight text-slate-600 uppercase"
												>{displayInfo.tokenSymbol}</span
											>
										</div>
										<span class="text-persian-orange text-xl leading-none font-bold">→</span>
									</div>
									<div class="flex flex-1 flex-col items-center space-y-1 text-center">
										{#if resolvedRecipientIdentity.imageUrl}
											<img
												src={resolvedRecipientIdentity.imageUrl}
												alt={resolvedRecipientIdentity.name || 'Recipient'}
												class="h-10 w-10 rounded-full object-cover ring-1 ring-slate-300"
											/>
										{:else}
											<div
												class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-base font-semibold text-slate-500 ring-1 ring-slate-300"
											>
												{resolvedRecipientIdentity.name?.charAt(0)?.toUpperCase() || 'R'}
											</div>{/if}
										<span class="text-prussian-blue/90 text-xs font-medium"
											>{resolvedRecipientIdentity.name || 'Recipient'}</span
										>
										<span
											class="font-mono text-[0.65rem] leading-tight text-slate-500"
											title={resolvedRecipientIdentity.address}
											>{resolvedRecipientIdentity.shortAddress ||
												shortAddress(
													resolvedRecipientIdentity.address || fallbackRecipientAddress
												)}</span
										>
									</div>
								</div>
							{/if}

							{#if currentTransactionSendHash}
								<div class="mt-3 space-y-1 rounded-md border border-slate-200 p-3">
									<h5 class="text-prussian-blue/90 text-sm font-medium">Transaction Sent</h5>
									<p class="text-prussian-blue/80 mb-1 text-xs">
										Hash: <span class="font-mono break-all">{currentTransactionSendHash}</span>
									</p>
									<a
										href={`https://gnosis.blockscout.com/tx/${currentTransactionSendHash}`}
										target="_blank"
										rel="noopener noreferrer"
										class="text-persian-orange hover:text-persian-orange/80 text-xs underline"
										>View on Gnosis Blockscout</a
									>
								</div>
							{/if}

							{#if transactionOutcomeForDisplay}
								<div class="mt-2 text-center">
									{#if transactionOutcomeForDisplay.status === 'success'}
										<span
											class="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700 shadow-sm"
										>
											{transactionOutcomeForDisplay.message}
										</span>
									{:else if transactionOutcomeForDisplay.status === 'reverted'}
										<span
											class="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700 shadow-sm"
										>
											{transactionOutcomeForDisplay.message}
										</span>
										{#if currentTransactionReceipt?.gasUsed}
											<p class="mt-1 text-xs text-red-500/80">
												(Gas Used: {currentTransactionReceipt.gasUsed.toString()})
											</p>
										{/if}
									{/if}
								</div>
							{/if}

							{#if currentErrorMessage}
								<div class="mt-3 rounded-md bg-red-100 p-3">
									<p class="text-sm text-red-700">
										<span class="font-medium">Error:</span>
										{currentErrorMessage}
									</p>
								</div>
							{/if}
						</div>
					{:else}
						<!-- SignTransaction Pre-Sign: Info -->
						<div class="mb-4 space-y-3">
							<h4 class="text-prussian-blue mb-3 text-base font-semibold">Transaction Summary:</h4>
							{#if displayInfo?.amount && displayInfo?.tokenSymbol && resolvedSenderIdentity && resolvedRecipientIdentity}
								<div
									class="my-4 flex items-center justify-between space-x-2 rounded-lg bg-slate-50 p-3 py-8 shadow-sm"
								>
									<div class="flex flex-1 flex-col items-center space-y-1 text-center">
										{#if resolvedSenderIdentity.imageUrl}
											<img
												src={resolvedSenderIdentity.imageUrl}
												alt={resolvedSenderIdentity.name || 'Sender'}
												class="h-12 w-12 rounded-full object-cover ring-1 ring-slate-300"
											/>
										{:else}
											<div
												class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-500 ring-1 ring-slate-300"
											>
												{resolvedSenderIdentity.name?.charAt(0)?.toUpperCase() || 'S'}
											</div>{/if}
										<span
											class="font-mono text-xs leading-tight break-all"
											title={resolvedSenderIdentity.address}
											>{resolvedSenderIdentity.name ||
												resolvedSenderIdentity.shortAddress ||
												shortAddress(resolvedSenderIdentity.address)}</span
										>
									</div>
									<div
										class="flex flex-shrink-0 items-center justify-center space-x-1.5 px-1 text-center"
									>
										<span class="text-persian-orange text-xl leading-none font-bold">→</span>
										<div class="flex flex-col items-center">
											<span class="text-prussian-blue text-lg leading-tight font-semibold"
												>{displayInfo.amount}</span
											>
											<span class="text-sm leading-tight text-slate-600 uppercase"
												>{displayInfo.tokenSymbol}</span
											>
										</div>
										<span class="text-persian-orange text-xl leading-none font-bold">→</span>
									</div>
									<div class="flex flex-1 flex-col items-center space-y-1 text-center">
										{#if resolvedRecipientIdentity.imageUrl}
											<img
												src={resolvedRecipientIdentity.imageUrl}
												alt={resolvedRecipientIdentity.name || 'Recipient'}
												class="h-12 w-12 rounded-full object-cover ring-1 ring-slate-300"
											/>
										{:else}
											<div
												class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-500 ring-1 ring-slate-300"
											>
												{resolvedRecipientIdentity.name?.charAt(0)?.toUpperCase() || 'R'}
											</div>{/if}
										<span
											class="font-mono text-xs leading-tight break-all"
											title={resolvedRecipientIdentity.address}
											>{resolvedRecipientIdentity.name ||
												resolvedRecipientIdentity.shortAddress ||
												shortAddress(
													resolvedRecipientIdentity.address || fallbackRecipientAddress
												)}</span
										>
									</div>
								</div>
								{#if displayInfo.description && !(displayInfo.description.startsWith('Transfer ') && displayInfo.amount && displayInfo.tokenSymbol && displayInfo.description.includes(displayInfo.amount) && displayInfo.description.includes(displayInfo.tokenSymbol))}
									<p
										class="text-prussian-blue/80 mt-3 border-t border-slate-200 pt-2 text-center text-xs italic"
									>
										{displayInfo.description}
									</p>
								{/if}
							{:else}
								<!-- Fallback display when full sender/recipient block is not shown -->
								{@const pkpEthToShow =
									resolvedSenderIdentity?.address || currentParams.pkpPublicKey}
								{#if displayInfo?.description}<p class="text-prussian-blue/90 mb-3 text-sm">
										{displayInfo.description}
									</p>{:else}<p class="text-prussian-blue/80 mb-3 text-sm">
										You are about to sign a blockchain transaction. Please review the specifics in
										the "Details" and "JSON" tabs before proceeding.
									</p>{/if}
								<div class="mt-2 space-y-1.5 text-xs">
									<div class="flex justify-between">
										<span class="text-prussian-blue/70">From (Your PKP):</span><span
											class="text-prussian-blue font-mono break-all"
											>{pkpEthToShow ? shortAddress(pkpEthToShow) : 'Loading...'}</span
										>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				{/if}
				{#if activeDetailTab === 'details'}
					{#if showResultView}
						<div class="space-y-3 text-xs">
							{#if currentSignTransactionResultSignature}
								<div>
									<h5 class="text-prussian-blue/90 mb-0.5 font-medium">Transaction Signature:</h5>
									<pre
										class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-[0.65rem] leading-snug">{JSON.stringify(
											currentSignTransactionResultSignature,
											bigIntReplacer,
											2
										)}</pre>
								</div>
							{/if}
							{#if currentTransactionReceipt}
								<div>
									<span class="text-prussian-blue/70">Block Hash:</span>
									<span class="font-mono break-all">{currentTransactionReceipt.blockHash}</span>
								</div>
								<div>
									<span class="text-prussian-blue/70">Block Number:</span>
									<span class="font-mono">{currentTransactionReceipt.blockNumber.toString()}</span>
								</div>
								<div>
									<span class="text-prussian-blue/70">Gas Used:</span>
									<span class="font-mono">{currentTransactionReceipt.gasUsed.toString()}</span>
								</div>
								{#if currentTransactionReceipt.effectiveGasPrice}<div>
										<span class="text-prussian-blue/70">Effective Gas Price:</span>
										<span class="font-mono"
											>{currentTransactionReceipt.effectiveGasPrice.toString()} wei</span
										>
									</div>{/if}
								<div>
									<span class="text-prussian-blue/70">Status:</span>
									<span
										class="font-medium {currentTransactionReceipt.status === 'success'
											? 'text-green-600'
											: 'text-red-600'}">{currentTransactionReceipt.status}</span
									>
								</div>
							{/if}
						</div>
					{:else}
						<div>
							<h4 class="text-prussian-blue mb-2 text-base font-semibold">
								Transaction Parameters:
							</h4>
							<div class="space-y-1.5 font-mono text-xs">
								{#if rawTx.to}<div>
										<span class="text-prussian-blue/70">To:</span>
										<span class="break-all">{rawTx.to}</span>
									</div>{/if}
								{#if rawTx.value !== undefined}<div>
										<span class="text-prussian-blue/70">Value:</span>
										{rawTx.value.toString()} wei ({formatUnits(rawTx.value, 18)} ETH)
									</div>{/if}
								{#if rawTx.data}<div>
										<span class="text-prussian-blue/70">Data:</span>
										<span class="break-all">{rawTx.data}</span>
									</div>{/if}
								{#if rawTx.nonce !== undefined}<div>
										<span class="text-prussian-blue/70">Nonce:</span>
										{rawTx.nonce.toString()}
									</div>{/if}
								{#if rawTx.gas}<div>
										<span class="text-prussian-blue/70">Gas Limit:</span>
										{rawTx.gas.toString()}
									</div>{/if}
								{#if rawTx.type === 'eip1559' || rawTx.type === 'eip2930' || rawTx.type === 'eip4844'}
									{#if rawTx.maxFeePerGas}<div>
											<span class="text-prussian-blue/70">Max Fee Per Gas:</span>
											{rawTx.maxFeePerGas.toString()} wei
										</div>{/if}
									{#if rawTx.maxPriorityFeePerGas}<div>
											<span class="text-prussian-blue/70">Max Priority Fee Per Gas:</span>
											{rawTx.maxPriorityFeePerGas.toString()} wei
										</div>{/if}
								{:else if rawTx.gasPrice}<div>
										<span class="text-prussian-blue/70">Gas Price:</span>
										{rawTx.gasPrice.toString()} wei
									</div>{/if}
								{#if rawTx.chainId}<div>
										<span class="text-prussian-blue/70">Chain ID:</span>
										{rawTx.chainId.toString()}
									</div>{/if}
							</div>
						</div>
					{/if}
				{/if}
				{#if activeDetailTab === 'json'}
					{#if showResultView}
						<div class="space-y-4 text-xs">
							{#if currentSignTransactionResultSignature}
								<div>
									<h5 class="text-prussian-blue/90 mb-0.5 font-medium">Raw Signature:</h5>
									<pre
										class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-[0.65rem] leading-snug">{JSON.stringify(
											currentSignTransactionResultSignature,
											bigIntReplacer,
											2
										)}</pre>
								</div>
							{/if}
							{#if currentTransactionReceipt}
								<div>
									<h5 class="text-prussian-blue/90 mb-0.5 font-medium">
										Full Transaction Receipt:
									</h5>
									<pre
										class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-[0.65rem] leading-snug">{JSON.stringify(
											currentTransactionReceipt,
											bigIntReplacer,
											2
										)}</pre>
								</div>
							{/if}
							{#if currentErrorMessage && !(currentSignTransactionResultSignature || currentTransactionReceipt)}
								<div>
									<h5 class="text-prussian-blue/90 mb-0.5 font-medium">Error Details:</h5>
									<pre class="rounded-md bg-red-100 p-2 text-red-700">{currentErrorMessage}</pre>
								</div>
							{/if}
						</div>
					{:else}
						<div>
							<h4 class="text-prussian-blue mb-2 text-base font-semibold">
								Raw Transaction Payload:
							</h4>
							<pre
								class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2.5 text-[0.7rem] leading-snug">{JSON.stringify(
									rawTx,
									bigIntReplacer,
									2
								)}</pre>
						</div>
					{/if}
				{/if}
			{/if}
		</div>
	{:else if showResultView}
		<!-- Result display section, ensure it has top margin if needed -->
		{#if currentSignMessageResultSignature}
			<div class="mt-4">
				<h4 class="text-prussian-blue text-sm font-medium">Signature:</h4>
				<pre
					class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-words whitespace-pre-wrap">{currentSignMessageResultSignature}</pre>
			</div>
		{/if}

		{#if currentLitActionResultObject}
			<div class="mt-4">
				<h4 class="text-prussian-blue text-sm font-medium">Lit Action Result:</h4>
				<pre
					class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-words whitespace-pre-wrap">{JSON.stringify(
						currentLitActionResultObject,
						null,
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

		{#if transactionOutcomeForDisplay}
			<div class="mt-3 text-center">
				{#if transactionOutcomeForDisplay.status === 'success'}
					<span
						class="inline-flex items-center rounded-full bg-green-100 px-3.5 py-1.5 text-sm font-semibold text-green-700 shadow-md"
					>
						{transactionOutcomeForDisplay.message}
					</span>
				{:else if transactionOutcomeForDisplay.status === 'reverted'}
					<span
						class="inline-flex items-center rounded-full bg-red-100 px-3.5 py-1.5 text-sm font-semibold text-red-700 shadow-md"
					>
						{transactionOutcomeForDisplay.message}
					</span>
					{#if currentTransactionReceipt?.gasUsed}
						<p class="mt-1 text-xs text-red-500/80">
							(Gas Used: {currentTransactionReceipt.gasUsed.toString()})
						</p>
					{/if}
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

	<!-- Button Container -->
	<div
		class="flex items-center pt-4 {showResultView && isSuccessResult && !isErrorState
			? 'justify-center'
			: 'justify-between'}"
	>
		{#if !showResultView && actionRequest && canProcess}
			<button
				onclick={clearFieldsAndDispatchClose}
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
						!(actionRequest.params as ExecuteLitActionParams).litActionCid?.startsWith('local:') &&
						!fetchedLitCode &&
						!(
							example42LitActionCode &&
							(actionRequest.params as ExecuteLitActionParams).litActionCid ===
								'local:example-42.js'
						)) ||
					!jsParamsInput.trim() ||
					(actionRequest.type === 'signTransaction' &&
						!(actionRequest.params as SignTransactionActionParams).transaction) ||
					isProcessing}
				class="rounded-2xl px-4 py-2 text-sm font-medium transition-colors
					   {!canProcess ||
				!actionRequest ||
				(actionRequest.type === 'signMessage' && !messageToSignInput.trim()) ||
				(actionRequest.type === 'executeLitAction' &&
					((!(actionRequest.params as ExecuteLitActionParams).litActionCid?.startsWith('local:') &&
						!fetchedLitCode &&
						!(
							example42LitActionCode &&
							(actionRequest.params as ExecuteLitActionParams).litActionCid ===
								'local:example-42.js'
						)) ||
						!jsParamsInput.trim())) ||
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
		{:else if showResultView && isSuccessResult && !isErrorState}
			<button
				onclick={clearFieldsAndDispatchClose}
				class="bg-prussian-blue text-linen hover:bg-opacity-90 focus:ring-persian-orange rounded-2xl border border-[var(--color-prussian-blue)] px-6 py-2 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
			>
				Close
			</button>
		{:else if showResultView && isErrorState}
			<!-- Error Mode: Show two buttons, Retry (which is effectively Close for now) and Close -->
			<button
				onclick={clearFieldsAndDispatchClose}
				class="focus:ring-persian-orange/50 rounded-2xl border border-[var(--color-prussian-blue)] px-4 py-2 text-sm font-medium text-[var(--color-prussian-blue)] transition-colors hover:bg-[var(--color-prussian-blue)]/10 focus:ring-2 focus:outline-none"
			>
				Retry / Close
			</button>
			<button
				onclick={clearFieldsAndDispatchClose}
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
