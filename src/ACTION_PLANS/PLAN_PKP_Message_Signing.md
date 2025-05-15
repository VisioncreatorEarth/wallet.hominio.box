# ACTION PLAN: PKP Message Signing via Passkey-LitAction

This plan outlines the steps to implement message signing using a user's PKP, where authorization is derived from their passkey verified by a Lit Action.

## Overall Goal:
Enable users to sign arbitrary messages using their Hominio Wallet (PKP), leveraging existing passkey authentication infrastructure and Lit Protocol.

## Milestones and Tasks:

### Milestone 1: Create the `litSigningService.ts`

This service will encapsulate the core logic for obtaining session signatures and signing messages with the PKP.

-   [x] **Task 1.1: Define `litSigningService.ts` Structure**
    *   Create `src/lib/wallet/services/litSigningService.ts`.
    *   Import necessary modules:
        *   `LitJsSdk` from `@lit-protocol/lit-node-client`.
        *   `LIT_ABILITY`, `LitPKPResource`, `LitActionResource` from `@lit-protocol/constants` or `@lit-protocol/auth-helpers`.
        *   `getLitClient` from `../lit-connect`.
        *   `passkeyVerifierLitActionCode` (or its IPFS CID mechanism) from `./litService.ts`.
        *   `EIP_1271_MAGIC_VALUE` from `./contractService.ts`.
        *   `formatSignatureForEIP1271` from `./contractService.ts`.
        *   `gnosis` chain config from `viem/chains`.
        *   `keccak256`, `toUtf8`, `Hex`, `Address`, `decodeBase64`, `hashMessage` from `viem`.
        *   User session data types/stores to get PKP info and passkey verifier contract address.
-   [x] **Task 1.2: Implement `prepareLitActionJsParams` Helper Function**
    *   Signature: `async function prepareLitActionJsParams(passkeyRawId: Hex, passkeyVerifierContractAddress: Address, challenge: Uint8Array): Promise<object>`
    *   Logic:
        *   Perform passkey assertion using `navigator.credentials.get()`:
            *   `challenge`: Use the provided challenge.
            *   `allowCredentials`: Use `passkeyRawId`.
        *   Extract `authenticatorData`, `clientDataJSON`, `signature` from assertion response.
        *   Parse `clientDataJSON` to get the actual challenge string that was signed.
        *   Calculate `messageHash` for Lit Action: `keccak256(actualChallengeBytes)` where `actualChallengeBytes` are from base64url decoding `clientData.challenge`.
        *   Format passkey signature: `formatSignatureForEIP1271(assertionResponse)`.
        *   Return `jsParams` object: `{ messageHash, formattedSignature, eip1271ContractAddress, EIP_1271_MAGIC_VALUE, chainRpcUrl: gnosis.rpcUrls.default.http[0] }`.
-   [x] **Task 1.3: Implement Core `signMessageWithPkp` Function**
    *   Signature: `async function signMessageWithPkp(messageToSign: string, pkpPublicKey: Hex, passkeyRawId: Hex, passkeyVerifierContractAddress: Address): Promise<{ signature: Hex } | { error: string }>`
    *   Logic:
        *   Get `litNodeClient` using `await getLitClient()`. Ensure it's connected.
        *   Generate a random challenge for passkey assertion (`crypto.getRandomValues(new Uint8Array(32))`).
        *   Call `prepareLitActionJsParams` to get `jsParams` for the Lit Action. Handle potential errors.
        *   Define `resourceAbilityRequests`:
            ```typescript
            const resourceAbilityRequests = [
              {
                resource: new LitPKPResource('*'),
                ability: LIT_ABILITY.PKPSigning,
              },
              {
                resource: new LitActionResource('*'), 
                ability: LIT_ABILITY.LitActionExecution,
              },
            ];
            ```
        *   Call `litNodeClient.getLitActionSessionSigs()`:
            *   `pkpPublicKey`: User's PKP public key.
            *   `litActionCode`: Base64 encoded `passkeyVerifierLitActionCode`.
            *   `jsParams`: From previous step.
            *   `resourceAbilityRequests`: Defined above.
            *   `chain`: "ethereum".
            *   `expiration`: 10 minutes from now.
            *   `capacityDelegationAuthSig`: Omitted for now.
        *   Handle errors from `getLitActionSessionSigs`.
        *   Prepare message digest for `pkpSign`: `const digestToSign = toBytes(hashMessage(messageToSign));`.
        *   Call `litNodeClient.pkpSign()`:
            *   `sessionSigs`: From `getLitActionSessionSigs`.
            *   `toSign`: The `digestToSign`.
            *   `pubKey`: The `pkpPublicKey`.
        *   Return `pkpSignResult.signature` as Hex.
        *   Catch all errors and return `{ error: string }`.

### Milestone 2: Integrate Signing Functionality

-   [x] **Task 2.1: Create `SignMessage.svelte` Component with UI Elements**
    *   Create `src/lib/components/wallet/SignMessage.svelte`.
    *   Add UI elements: `<textarea name="messageToSign">`, "Sign Message" `<button>`, display areas for signature/error.
    *   Define component props (using `$props()`):
        *   `pkpPublicKey: Hex | null`
        *   `passkeyRawId: Hex | null`
        *   `passkeyVerifierContractAddress: Address | null`
        *   `isSigningProcessActive: boolean`
        *   `signatureResult: Hex | null`
        *   `signingErrorDetail: string | null`
    *   Define internal state: `messageToSign = $state('')`.
    *   Define event dispatcher: `createEventDispatcher<{ sign: string; clear: void }>()`.
    *   On button click, if `messageToSign` is not empty, dispatch a `sign` event with `messageToSign` as detail.
    *   Add a button/mechanism to clear the signature/error and message, dispatching a `clear` event.
-   [x] **Task 2.2: Integrate `SignMessage.svelte` into `me/+page.svelte`**
    *   Import `SignMessage.svelte` from `$lib/components/wallet/SignMessage.svelte`.
    *   Import `signMessageWithPkp` from `$lib/wallet/services/litSigningService`.
    *   Add a new tab configuration: `{ id: 'signMessage', label: 'Sign Message' }`. Show this tab only if `hasHominioWallet` is true.
    *   In the main content area, when `activeTab === 'signMessage'`, render `<SignMessage ... />`.
    *   Pass the required props (`pkpPublicKey`, `passkeyRawId`, `passkeyVerifierContractAddress`) from `$session.data.user.pkp_passkey` (via `currentPkpData`) to the component.
    *   Pass `isSigningProcessActive={isSigningMessage}` prop.
    *   Pass `signatureResult={messageSignature}` prop.
    *   Pass `signingErrorDetail={messageSigningError}` prop.
    *   Add page state variables: `isSigningMessage = $state(false)`, `messageSignature = $state<Hex | null>(null)`, `messageSigningError = $state<string | null>(null)`.
    *   Implement `async function handleSignRequest(event: CustomEvent<string>)`:
        *   Set `isSigningMessage = true`, clear `messageSignature`, `messageSigningError`.
        *   Get PKP and passkey details from `currentPkpData`. Validate.
        *   Call `signMessageWithPkp(event.detail, pkpPublicKey, passkeyRawId, passkeyVerifierContractAddress)`.
        *   Update `messageSignature` or `messageSigningError`.
        *   Set `isSigningMessage = false`.
    *   Implement `function handleClearSignature()`:
        *   Set `messageSignature = null`, `messageSigningError = null`.
    *   Listen to the `sign` event from `SignMessage.svelte` and call `handleSignRequest`.
    *   Listen to the `clear` event from `SignMessage.svelte` and call `handleClearSignature`.

### Milestone 3: Testing and Refinement

-   [ ] **Task 3.1: Basic Functionality Test**
    *   Connect EOA wallet, create Hominio Wallet (PKP + Passkey).
    *   Navigate to the "me" page.
    *   Enter a test message and click "Sign Message".
    *   Verify passkey prompt appears.
    *   Verify a signature is displayed without errors.
-   [ ] **Task 3.2: Test Session Behavior (Caching/Re-prompting)**
    *   After a successful signature, try signing another message immediately or after a short period.
    *   Observe if the passkey prompt reappears. This will clarify how `getLitActionSessionSigs` interacts with SDK-level session caching when the Lit Action itself is the authorizer.
-   [ ] **Task 3.3: Error Handling Test**
    *   Cancel passkey prompt: Verify a user-friendly error.
    *   Simulate missing PKP/passkey data: Verify appropriate error messages.
    *   (If possible) Simulate Lit Action failure: Verify error propagation.

## Required Documentation/References:
-   Lit Protocol SDK Docs:
    -   `getLitActionSessionSigs`
    -   `pkpSign`
    -   `LitPKPResource`, `LitActionResource`, `LIT_ABILITY`
    -   Session Management (especially caching behavior when Lit Actions authorize sessions)
    -   `jsParams` for Lit Actions
-   Viem documentation for:
    -   `keccak256`, `toUtf8`, `hashMessage`, `toBytes`, `decodeBase64`
-   WebAuthn API for `navigator.credentials.get()`.

## Notes & Considerations:
-   **Lit Action IPFS CID:** Using the raw `litActionCode` (base64 encoded) is feasible. If an IPFS CID is consistently used for the `passkeyVerifierLitActionCode` elsewhere (e.g., during PKP minting), using that CID via `litActionIpfsId` parameter in `getLitActionSessionSigs` would be cleaner and avoid sending code over the wire. The current `mintPKPWithLitActionAuthAndCapacity` computes this CID. We should aim to use the CID if easily accessible.
-   **`capacityDelegationAuthSig`:** Verify if this is needed for `getLitActionSessionSigs` on the target Lit network (e.g., Chronicle, Datil). The provided docs for `getLitActionSessionSigs` example show it.
-   **Error Handling:** Robust error handling is crucial, especially for user interactions like passkey prompts and network issues.
-   **Signature Format:** Ensure the signature returned by `pkpSign` and exposed to the user is in a standard, usable format (e.g., hex-encoded `r+s+v`). The `pkpSign` function returns an object; we need to decide how to represent this as a single string/hex.
-   **Passkey `rawId` format:** Ensure `rawId` obtained from session is correctly formatted (likely hex string) for `allowCredentials`.

This plan will be updated as progress is made. 