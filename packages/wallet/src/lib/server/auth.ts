import { env } from '$env/dynamic/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { betterAuth } from "better-auth";
import pkg from 'pg';
import { pkpPasskeyServerPlugin } from './pkp-passkey-plugin';
import { polar, webhooks, portal, checkout } from '@polar-sh/better-auth';
import { Polar } from '@polar-sh/sdk';
const { Pool } = pkg;

// Initialize Polar Client
const polarClient = new Polar({
    accessToken: env.SECRET_POLAR_ACCESS_TOKEN,
    server: 'sandbox', // Use 'production' for live environment
});

export const auth = betterAuth({
    database: new Pool({
        connectionString: env.SECRET_DATABASE_URL_AUTH
    }),
    socialProviders: {
        google: {
            clientId: env.SECRET_GOOGLE_CLIENT_ID,
            clientSecret: env.SECRET_GOOGLE_CLIENT_SECRET,
            redirectUri: `${PUBLIC_BASE_URL}/auth/callback/google`
        },
    },
    trustedOrigins: [
        PUBLIC_BASE_URL
    ],
    plugins: [
        pkpPasskeyServerPlugin(),
        polar({
            client: polarClient,
            createCustomerOnSignUp: true,
            use: [
                webhooks({
                    secret: env.SECRET_POLAR_WEBHOOK_SECRET,
                    onPayload: async (payload) => {
                        // Log the type of event and the data associated with it.
                        // The specific ID field might be nested differently depending on the payload type.
                        console.log('Polar Webhook Received - Type:', payload.type);
                        if ('data' in payload && payload.data && typeof payload.data === 'object' && 'id' in payload.data) {
                            console.log('Polar Webhook Event ID (from data.id):', (payload.data as { id: unknown }).id);
                        } else {
                            console.log('Polar Webhook Payload Data:', payload.data);
                        }
                    },
                    // You can add more specific handlers here based on payload.type if needed
                    // For example, for customer creation:
                    onCustomerCreated: async (payload) => {
                        console.log('Specific Handler: Polar Customer Created - ID:', payload.data.id, 'External ID:', payload.data.externalId);
                    },
                    onCustomerUpdated: async (payload) => {
                        console.log('Specific Handler: Polar Customer Updated - ID:', payload.data.id, 'External ID:', payload.data.externalId);
                    }
                }),
                portal(),
                checkout({
                    products: [
                        {
                            productId: "b805589e-2382-49d1-9409-73e42baeb1c7",
                            slug: "standard-plan"
                        }
                    ],
                    successUrl: "/me?tab=tokenBalance&checkout_id={CHECKOUT_ID}",
                    authenticatedUsersOnly: true
                })
            ]
        })
    ]
});
