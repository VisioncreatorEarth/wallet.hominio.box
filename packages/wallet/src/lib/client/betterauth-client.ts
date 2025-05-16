import { createAuthClient } from "better-auth/svelte"
import { PUBLIC_BASE_URL } from '$env/static/public';
import { pkpPasskeyClientPlugin } from './pkp-passkey-plugin';
import { polarClient } from '@polar-sh/better-auth';

export const authClient = createAuthClient({
    baseURL: PUBLIC_BASE_URL,
    plugins: [
        pkpPasskeyClientPlugin(),
        polarClient()
    ]
})