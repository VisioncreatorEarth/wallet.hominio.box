# MVP Action Plan: Add 'Transaction Signing' Action Type

This plan outlines the steps to add a new `signTransaction` action type to the existing `Signer.svelte` modal flow. The modal will receive a pre-formed transaction object, facilitate its signing via the user's PKP, and return the signature.

## Milestones

### Milestone 1: Define Types for Transaction Signing

-   [ ] **Task 1.1:** Update `actionTypes.ts`.
    *   Define `SignTransactionActionParams` interface:
        ```typescript
        import type { TransactionSerializable } from 'viem';
        // ... other imports
        export interface SignTransactionActionParams extends BaseActionParams {
          transaction: TransactionSerializable;
          // Optional: Add any metadata needed for display, e.g., token symbol for summary
          transactionDisplayInfo?: {
            description?: string; // e.g., "Transfer 0.1 SAHEL to ..."
            tokenSymbol?: string;
            amount?: string;
            recipient?: string;
          };
        }
        ```
    *   Define `SignTransactionActionResultDetail` interface:
        ```typescript
        import type { Signature } from 'viem';
        // ... other imports
        export interface SignTransactionActionResultDetail extends BaseActionResult {
          type: 'signTransaction';
          signature?: Signature; // Viem's Signature type { r, s, v } or { r, s, yParity }
          error?: string;
        }
        ```
    *   Update the `RequestActionParams` union type to include `SignTransactionActionParams`.
    *   Update the `RequestActionDetail` type definition if needed (it uses `RequestActionParams` generically, so might not need direct change if `type` string is 'signTransaction'). Ensure `type` can be `'signTransaction'`. Example:
        ```typescript
        export type RequestActionDetail = 
          | { type: 'signMessage'; params: SignMessageActionParams }
          | { type: 'executeLitAction'; params: ExecuteLitActionParams }
          | { type: 'signTransaction'; params: SignTransactionActionParams }; // Add this
        ```
    *   Update the `ActionResultDetail` union type to include `SignTransactionActionResultDetail`.
        ```typescript
        export type ActionResultDetail =
          | SignMessageActionResultDetail
          | ExecuteLitActionResultDetail
          | SignTransactionActionResultDetail; // Add this
        ```
    *   Define `SimplifiedSignTransactionUiParams` for the `ExecuteEventDetail`:
        ```typescript
        export interface SimplifiedSignTransactionUiParams {
            transaction: TransactionSerializable; // The transaction object that came from the Signer UI
        }
        ```
    *   Update `ExecuteEventDetail` union:
        ```typescript
        export type ExecuteEventDetail =
          | { type: 'signMessage'; uiParams: SimplifiedSignMessageUiParams }
          | { type: 'executeLitAction'; uiParams: SimplifiedExecuteLitActionUiParams }
          | { type: 'signTransaction'; uiParams: SimplifiedSignTransactionUiParams }; // Add this
        ```
    *   File: `packages/wallet/src/lib/wallet/actionTypes.ts`

### Milestone 2: Implement Transaction Signing Service Logic

-   [ ] **Task 2.1:** Create `signTransactionWithPkp` function in `litSigningService.ts`.
    *   **Inputs:** `pkpTokenId: string`, `pkpPublicKey: Hex`, `passkeyRawId: Hex`, `passkeyVerifierContractAddress: Address`, `transactionToSign: TransactionSerializable`.
    *   Serialize the `transactionToSign` using Viem's `serializeTransaction`.
    *   Compute the `keccak256` hash of the serialized transaction. This is the digest to be signed.
    *   Call the internal `_acquirePkpSessionSigs` function (already in `litSigningService.ts`) to get `sessionSigs`, using appropriate `LitResourceAbilityRequest` (e.g., `new LitPKPResource('*')` with `ability: 'pkp-signing'`).
    *   Call `litNodeClient.pkpSign({ sessionSigs, toSign: digestToSignBytes, pubKey: pkpPublicKey })`.
    *   Convert the `SigResponse` from `pkpSign` (which contains `r`, `s`, `recid`) into a Viem-compatible `Signature` object. For EIP-1559 transactions, this typically means `{ r: Hex, s: Hex, yParity: 0 | 1 }`. `recid` is usually `yParity`.
    *   **Return:** `Promise<{ signature: Signature } | { error: string }>`.
    *   File: `packages/wallet/src/lib/wallet/services/litSigningService.ts`.

### Milestone 3: Integrate Service into Layout Handler

-   [ ] **Task 3.1:** Update `handleActionExecuteRequest` in `+layout.svelte`.
    *   Add a new `else if (eventDetail.type === 'signTransaction')` block.
    *   Retrieve the `transaction` from `eventDetail.uiParams as SimplifiedSignTransactionUiParams`.
    *   Call the new `signTransactionWithPkp` service function, passing the necessary PKP details and the transaction object.
    *   If successful, store the returned `Signature` object in `actionPrimaryResult`.
    *   Set `actionErrorDetail` if an error occurs.
    *   Update `currentProcessResultStore` with the `SignTransactionActionResultDetail` (either the signature or the error).
    *   File: `packages/wallet/src/routes/me/+layout.svelte`.

### Milestone 4: Update Signer Component UI

-   [ ] **Task 4.1:** Modify `Signer.svelte`.
    *   Add an `{#if actionRequest?.type === 'signTransaction'}` block in the template.
        *   Inside this block, display some basic details of the transaction. For MVP, `JSON.stringify(actionRequest.params.transaction, null, 2)` inside a `<pre>` tag is sufficient.
        *   Consider displaying `actionRequest.params.transactionDisplayInfo?.description` if provided.
    *   Update the main action button's text content conditionally: if `actionRequest?.type === 'signTransaction'`, set text to "Sign Transaction".
    *   Ensure the `requestAction` function correctly prepares the `ExecuteEventDetail` for `signTransaction`:
        ```javascript
        // In requestAction within Signer.svelte
        if (actionRequest.type === 'signTransaction') {
            const uiParams: SimplifiedSignTransactionUiParams = {
                transaction: (actionRequest.params as SignTransactionActionParams).transaction
            };
            eventDetail = { type: 'signTransaction', uiParams };
        }
        ```
    *   Ensure the `disabled` state of the action button considers the `signTransaction` type if specific validations are needed (for MVP, it might just rely on `canProcess` and `actionRequest` being present).
    *   Update derived states for displaying results if necessary (e.g., `currentSignTransactionResult` that extracts the signature from `processResult`).
        ```javascript
        const currentSignTransactionResult = $derived(
		    processResult?.type === 'signTransaction' ? processResult.signature : null
	    );
        // In the template:
        {#if currentSignTransactionResult}
            <div class="mt-4">
                <h4 class="text-prussian-blue text-sm font-medium">Transaction Signature:</h4>
                <pre class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs break-words whitespace-pre-wrap">{JSON.stringify(currentSignTransactionResult, null, 2)}</pre>
            </div>
        {/if}
        ```
    *   Update `showResultView` and `isSuccessResult` to include `currentSignTransactionResult`.
    *   File: `packages/wallet/src/lib/components/Signer.svelte`.

### Milestone 5: Implement Test Case Trigger

-   [ ] **Task 5.1:** Add a test trigger in `+page.svelte` (under the "Test Signer" tab or a new section).
    *   Add a button: "Initiate Sahel Token Transfer Signing".
    *   **On click:**
        1.  Hardcode `SAHEL_TOKEN_ADDRESS` and the recipient address (e.g., `$guardianEoaAddressStore` if available, or another hardcoded address for testing).
        2.  Amount to send (e.g., 0.1 SAHEL, use `parseUnits`).
        3.  Create a `publicClient` for Gnosis chain.
        4.  Fetch PKP's current `nonce` for the Gnosis chain: `publicClient.getTransactionCount({ address: pkpEthAddress, blockTag: 'pending' })`.
        5.  Estimate EIP-1559 gas fees: `publicClient.estimateFeesPerGas()` to get `maxFeePerGas` and `maxPriorityFeePerGas`.
        6.  Encode the ERC20 `transfer` function data: `encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient, amount] })`.
        7.  Estimate `gas` for the transaction: `publicClient.estimateGas({ account: pkpEthAddress, to: SAHEL_TOKEN_ADDRESS, data: encodedTransferData, value: 0n })`.
        8.  Construct the `TransactionSerializableEIP1559` object (`unsignedTx`).
        9.  Get the `openSignTransactionModal` function from context (similar to `openSignMessageModal`). This function will need to be added to `+layout.svelte`'s context.
        10. Call `openSignTransactionModal(unsignedTx, { description: "Transfer 0.1 SAHEL..." })`.
    *   This logic will be similar to parts of `handleSendSahelToken` in the Hominio `/routes/me/wallet/+page.svelte` example.
    *   File: `packages/wallet/src/routes/me/+page.svelte`.
-   [ ] **Task 5.2:** Update `+layout.svelte` to provide `openSignTransactionModal`.
    *   Create `openSignTransactionModal(transaction: TransactionSerializable, displayInfo?: {description: string})` function.
    *   This function will set `currentActionRequest` to `{ type: 'signTransaction', params: { transaction, pkpPublicKey: ..., passkeyRawId: ..., ..., transactionDisplayInfo: displayInfo } }`.
    *   Clear previous results and open the modal.
    *   Add this function to `setContext`.
    *   File: `packages/wallet/src/routes/me/+layout.svelte`.

### Milestone 6: Testing

-   [ ] **Task 6.1:** Click the test button in `+page.svelte`.
-   [ ] **Task 6.2:** Verify the `Signer.svelte` modal opens and displays basic transaction details.
-   [ ] **Task 6.3:** Approve the signing. Verify the passkey authentication flow is triggered.
-   [ ] **Task 6.4:** Verify the modal displays the resulting signature object.
-   [ ] **Task 6.5:** (Manual) Take the signature and the original transaction object, use a Viem `publicClient` to `sendRawTransaction` and confirm it's accepted by the network (or a local testnet node if configured).

This plan focuses on getting the signature. Broadcasting is a subsequent step that would use this signature. 