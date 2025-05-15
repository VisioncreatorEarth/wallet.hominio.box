<script lang="ts">
	import type { Hex, Address } from 'viem';
	import { createEventDispatcher } from 'svelte';

	// Props using Svelte 5 runes syntax
	let {
		pkpPublicKey = null as Hex | null,
		passkeyRawId = null as Hex | null,
		passkeyVerifierContractAddress = null as Address | null,
		isSigningProcessActive = false,
		signatureResult = null as Hex | null,
		signingErrorDetail = null as string | null
	} = $props<{
		// type assertion for stricter checking
		pkpPublicKey?: Hex | null;
		passkeyRawId?: Hex | null;
		passkeyVerifierContractAddress?: Address | null;
		isSigningProcessActive?: boolean;
		signatureResult?: Hex | null;
		signingErrorDetail?: string | null;
	}>();

	// Internal state for the message input
	let messageToSign = $state('');

	const dispatch = createEventDispatcher<{ sign: string; clear: void }>();

	function requestSign() {
		if (!messageToSign.trim()) {
			alert('Please enter a message to sign.');
			return;
		}
		dispatch('sign', messageToSign);
	}

	function clearFields() {
		messageToSign = '';
		dispatch('clear'); // Parent will clear signatureResult and signingErrorDetail
	}

	const canSign = $derived(pkpPublicKey && passkeyRawId && passkeyVerifierContractAddress);
</script>

<div class="bg-background-surface space-y-4 rounded-xl p-6 shadow-xs">
	<h3 class="text-prussian-blue text-lg font-semibold">Sign a Message</h3>

	{#if !canSign}
		<p class="text-sm text-orange-600">
			Wallet information (PKP Public Key, Passkey Raw ID, Verifier Address) is not available. Please
			ensure your Hominio Wallet is fully set up.
		</p>
	{/if}

	<div>
		<label for="messageToSignInput" class="text-prussian-blue/80 mb-1 block text-sm font-medium"
			>Message:</label
		>
		<textarea
			id="messageToSignInput"
			name="messageToSignInput"
			rows="4"
			class="border-timberwolf-2/50 focus:border-persian-orange focus:ring-persian-orange block w-full rounded-md bg-white p-2 shadow-sm disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none sm:text-sm"
			placeholder="Enter the message you want to sign..."
			bind:value={messageToSign}
			disabled={!canSign || isSigningProcessActive}
		></textarea>
	</div>

	<div class="flex items-center space-x-3">
		<button
			onclick={requestSign}
			disabled={!canSign || !messageToSign.trim() || isSigningProcessActive}
			class="rounded-md px-4 py-2 text-sm font-medium transition-colors
                   {!canSign || !messageToSign.trim() || isSigningProcessActive
				? 'cursor-not-allowed bg-slate-300 text-slate-500'
				: 'bg-prussian-blue text-linen hover:bg-opacity-90 focus:ring-persian-orange focus:ring-2 focus:outline-none'}"
		>
			{#if isSigningProcessActive}
				<span class="spinner-tiny mr-2"></span> Signing...
			{:else}
				Sign Message
			{/if}
		</button>
		<button
			onclick={clearFields}
			disabled={isSigningProcessActive}
			class="border-timberwolf-2/80 text-prussian-blue/90 hover:bg-timberwolf-1/50 focus:ring-persian-orange rounded-md border px-4 py-2 text-sm font-medium focus:ring-2 focus:outline-none disabled:opacity-50"
		>
			Clear
		</button>
	</div>

	{#if signatureResult}
		<div class="mt-4">
			<h4 class="text-prussian-blue text-sm font-medium">Signature:</h4>
			<pre
				class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-all">{signatureResult}</pre>
		</div>
	{/if}

	{#if signingErrorDetail}
		<div class="mt-4 rounded-md bg-red-50 p-3">
			<p class="text-sm text-red-700">
				<span class="font-medium">Error:</span>
				{signingErrorDetail}
			</p>
		</div>
	{/if}
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
