export const passkeyVerifierLitActionCode = `
const go = async () => {
  // Ensure essential Lit and ethers objects are available
  if (typeof ethers === 'undefined') { throw new Error("ethers.js unavailable"); }
  if (typeof Lit === 'undefined' || !Lit.Actions || !Lit.Actions.getRpcUrl || !Lit.Actions.setResponse) { throw new Error("Lit.Actions unavailable"); }

  const nullAddress = '0x0000000000000000000000000000000000000000';

  // Check for jsParams strictly used in THIS action.
  if (!messageHash || !formattedSignature || !JS_EIP_1271_MAGIC_VALUE || !eip1271ContractAddress || eip1271ContractAddress.toLowerCase() === nullAddress || !chainRpcUrl) {
    throw new Error("Missing required jsParams (messageHash, formattedSignature, JS_EIP_1271_MAGIC_VALUE, valid eip1271ContractAddress, or chainRpcUrl).");
  }

  let verified = false;
  let rpcUrlToUse = null;

  // Attempt to use the Lit Node's internal RPC for 'xdai' (Gnosis) first.
  try {
    const potentialInternalRpcUrl = await Lit.Actions.getRpcUrl({ chain: 'xdai' });
    if (potentialInternalRpcUrl && typeof potentialInternalRpcUrl === 'string' && potentialInternalRpcUrl.startsWith('http')) {
      rpcUrlToUse = potentialInternalRpcUrl;
      // console.log("Using internal Lit RPC for Gnosis: " + rpcUrlToUse);
    }
  } catch (e) {
    // console.log("Internal Lit RPC for 'xdai' failed or unavailable, proceeding with external chainRpcUrl. Error: " + e.message);
  }

  // Fallback to the jsParam chainRpcUrl if internal RPC failed or wasn't valid.
  if (!rpcUrlToUse) {
    if (typeof chainRpcUrl === 'string' && chainRpcUrl.startsWith('http')) {
        rpcUrlToUse = chainRpcUrl;
        // console.log("Using external chainRpcUrl for Gnosis: " + rpcUrlToUse);
    } else {
        throw new Error("Invalid or missing chainRpcUrl jsParam, and internal Lit RPC for 'xdai' failed or was invalid.");
    }
  }
  
  const provider = new ethers.providers.JsonRpcProvider(rpcUrlToUse);
  const magicValueLower = JS_EIP_1271_MAGIC_VALUE.toLowerCase();
  let contractCallResult;

  try {
    // Minimal ABI for the EIP-1271 isValidSignature function
    const eip1271Interface = new ethers.utils.Interface([
      "function isValidSignature(bytes32 _hash, bytes _signature) view returns (bytes4 magicValue)"
    ]);
    // Encode the function call data
    const calldata = eip1271Interface.encodeFunctionData("isValidSignature", [messageHash, formattedSignature]);
    
    // Make the read-only contract call to the EIP-1271 verifier
    contractCallResult = await provider.call({ to: eip1271ContractAddress, data: calldata });

    // Check if the returned magic value matches the expected one
    if (contractCallResult && typeof contractCallResult === 'string' && contractCallResult.toLowerCase().startsWith(magicValueLower)) {
      verified = true;
    }
  } catch (e) {
    console.error("Error during EIP-1271 isValidSignature call within Lit Action:", e);
    // Do not re-throw here, let the final check handle the response
  }
  
  // Set the Lit Action response based on verification status
  if (verified) {
    Lit.Actions.setResponse({ response: JSON.stringify({ verified: true, message: 'Signature verified successfully.' }) });
  } else {
    let errMsg = "EIP-1271 signature verification failed within Lit Action. Contract: " + eip1271ContractAddress + ", RPC: " + rpcUrlToUse;
    if (contractCallResult !== undefined) { 
        errMsg += ". Contract call result: " + contractCallResult;
    } else {
        errMsg += ". Contract call did not return a result or threw an error.";
    }
    throw new Error(errMsg);
  }
};
go();
`; 