<script lang="ts">
	import type { Hex, Address } from 'viem'; // Address might not be needed directly in UI component
	// import { createEventDispatcher } from 'svelte'; // REMOVED
	import type { ExecuteJsResponse } from '@lit-protocol/types';
	import { example42LitActionCode } from '../wallet/lit-actions/example-42';

	import type {
		ActionType, // Keep for clarity if needed, though actionRequest.type is primary
		SignMessageActionParams,
		ExecuteLitActionParams,
		RequestActionDetail,
		ActionResultDetail,
		SimplifiedSignMessageUiParams,
		SimplifiedExecuteLitActionUiParams,
		ExecuteEventDetail
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

	const jsParamsPlaceholder = '{"param1": "value1", "param2": 123}';

	$effect(() => {
		if (actionRequest) {
			// Set input fields based on the type of action requested
			if (actionRequest.type === 'signMessage') {
				messageToSignInput = (actionRequest.params as SignMessageActionParams).messageToSign;
			} else if (actionRequest.type === 'executeLitAction') {
				litActionCodeInput = (actionRequest.params as ExecuteLitActionParams).litActionCode;
				jsParamsInput = JSON.stringify(
					(actionRequest.params as ExecuteLitActionParams).jsParams,
					null,
					2
				);
			}
		} else {
			// If actionRequest becomes null, reset fields
			messageToSignInput = '';
			litActionCodeInput = example42LitActionCode;
			jsParamsInput = JSON.stringify({ magicNumber: 42 }, null, 2);
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
			if (!litActionCodeInput.trim()) {
				alert('Please provide Lit Action code.');
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
				litActionCode: litActionCodeInput,
				jsParams: jsParamsParsed
			};
			eventDetail = { type: 'executeLitAction', uiParams };
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

	const showResultView = $derived(
		!!currentSignMessageResult || !!currentLitActionResult || !!currentErrorMessage
	);

	const isSuccessResult = $derived(!!currentSignMessageResult || !!currentLitActionResult);

	const isErrorState = $derived(!!currentErrorMessage);
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
				<label for="litActionCodeInput" class="text-prussian-blue/80 mb-1 block text-sm font-medium"
					>Lit Action Code:</label
				>
				<textarea
					id="litActionCodeInput"
					rows="8"
					class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 font-mono text-xs shadow-sm disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none sm:text-sm"
					placeholder="Enter the Lit Action JavaScript code..."
					bind:value={litActionCodeInput}
					disabled={!canProcess || isProcessing}
				></textarea>
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
						(!litActionCodeInput.trim() || !jsParamsInput.trim())) ||
					isProcessing}
				class="rounded-2xl px-4 py-2 text-sm font-medium transition-colors
					   {!canProcess ||
				!actionRequest ||
				(actionRequest.type === 'signMessage' && !messageToSignInput.trim()) ||
				(actionRequest.type === 'executeLitAction' &&
					(!litActionCodeInput.trim() || !jsParamsInput.trim())) ||
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
