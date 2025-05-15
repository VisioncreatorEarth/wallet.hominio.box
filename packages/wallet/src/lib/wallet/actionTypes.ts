import type { Hex, Address } from 'viem';
import type { ExecuteJsResponse } from '@lit-protocol/types';

export type ActionType = 'signMessage' | 'executeLitAction';

// Base parameters including PKP details, prepared by the layout/orchestrator
export interface BaseActionParams {
    pkpPublicKey: Hex;
    passkeyRawId: Hex;
    passkeyVerifierContractAddress: Address;
    pkpTokenId: string;
}

export interface SignMessageActionParams extends BaseActionParams {
    messageToSign: string;
}

export interface ExecuteLitActionParams extends BaseActionParams {
    litActionCode: string;
    jsParams: Record<string, unknown>;
}

// The comprehensive request detail passed to the SignMessage/Action modal component
export type ActionParams = SignMessageActionParams | ExecuteLitActionParams;
export interface RequestActionDetail {
    type: ActionType;
    params: ActionParams; // Contains full BaseActionParams + specific params
}


export interface SimplifiedSignMessageUiParams {
    messageToSign: string;
}

export interface SimplifiedExecuteLitActionUiParams {
    litActionCode: string;
    jsParams: Record<string, unknown>;
}

export type ExecuteEventUiParams = SimplifiedSignMessageUiParams | SimplifiedExecuteLitActionUiParams;

export interface ExecuteEventDetail {
    type: ActionType;
    uiParams: ExecuteEventUiParams;
}
// ----------------------------------------------------------------------

// Dispatch details from the modal/component for the RESULT/ERROR
export interface SignMessageResultDetail {
    type: 'signMessage';
    signature?: Hex;
    error?: string;
}

export interface ExecuteLitActionResultDetail {
    type: 'executeLitAction';
    result?: ExecuteJsResponse;
    error?: string;
}

export type ActionResultDetail = SignMessageResultDetail | ExecuteLitActionResultDetail; 