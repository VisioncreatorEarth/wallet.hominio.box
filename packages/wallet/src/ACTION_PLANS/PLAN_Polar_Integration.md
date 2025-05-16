# Polar Integration Action Plan

This plan outlines the steps to integrate Polar with Better Auth for automatic customer creation in the Polar sandbox environment upon new user signup, and initial webhook setup.

## Milestone 1: Initial Setup and Configuration [COMPLETED]

This milestone focuses on installing the necessary dependencies and configuring the Better Auth server-side plugin for Polar, including basic webhook setup.

### Subtasks:

- [x] **Install Polar SDK and Better Auth Plugin**
- [x] **Configure Environment Variables**
- [x] **Set up Localtunnel for Webhook Development**
- [x] **Configure Webhook Endpoint in Polar Dashboard**
- [x] **Update `auth.ts`**
- [x] **Verify `betterauth-client.ts`**

## Milestone 2: Testing User Signup and Webhook [COMPLETED]

This milestone focuses on testing the integration to ensure Polar customers are created when new users sign up and that webhooks are being received.

### Subtasks:

- [x] **Perform a Test Signup**
- [x] **Verify Customer Creation in Polar**
- [x] **Verify Webhook Reception**

## Milestone 3: Expand Polar Integration (Checkout & Portal) [IN PROGRESS]

This milestone will cover the integration of Polar's checkout and customer portal functionalities.

### Phase: Enable Customer Portal [COMPLETED]

- [x] **Update Server-Side Auth (`auth.ts`)**
- [x] **Update Client-Side Auth (`betterauth-client.ts`)**
- [x] **Implement UI Element for Portal Access**
- [x] **Test Customer Portal Access**

### Current Phase: Enable Checkout

- [ ] **Update Server-Side Auth (`auth.ts`)**:
    - Import `checkout` from `@polar-sh/better-auth`.
    - Add `checkout({...})` to the `use` array within the `polar` plugin configuration.
    - Configure at least one product using its `productId` (e.g., `b805589e-2382-49d1-9409-73e42baeb1c7`) and a `slug` (e.g., "standard-plan").
    - Define a `successUrl` (e.g., "/me/purchase-success?checkout_id={CHECKOUT_ID}").
    - Set `authenticatedUsersOnly: true` (recommended for most SaaS setups).
- [ ] **Implement UI Element for Checkout**:
    - Add a button or link in the UI (e.g., a pricing page or upgrade button) that calls `await authClient.checkout({ slug: "standard-plan" })` (or using `productId`).
- [ ] **Create Success Page**:
    - Create a Svelte page for the `successUrl` (e.g., `src/routes/me/purchase-success/+page.svelte`).
    - This page can display a success message and potentially use the `checkout_id` from the URL to fetch more details if needed (though often just confirming success is enough).
- [ ] **Test Checkout Flow**:
    - Log in as a test user.
    - Click the new checkout UI element.
    - Verify redirection to the Polar checkout page for the specified product.
    - Complete the (sandbox) purchase.
    - Verify redirection to your `successUrl`.
    - Check the Customer Portal again to see if the purchase/subscription is listed.
    - Check Polar dashboard for order/subscription records.

### Future Phases for Milestone 3:

- [ ] (Potentially) Configure more granular webhooks for order and subscription events if specific backend actions are needed beyond what the portal handles.

## Progress Tracking:

- **Milestone 1:** [COMPLETED]
    - Install Polar SDK and Better Auth Plugin: [x]
    - Configure Environment Variables: [x]
    - Set up Localtunnel for Webhook Development: [x]
    - Configure Webhook Endpoint in Polar Dashboard: [x]
    - Update `auth.ts`: [x]
    - Verify `betterauth-client.ts`: [x]
- **Milestone 2:** [COMPLETED]
    - Perform a Test Signup: [x]
    - Verify Customer Creation in Polar: [x]
    - Verify Webhook Reception: [x]
- **Milestone 3:** [IN PROGRESS]
    - **Enable Customer Portal:** [COMPLETED]
        - Update Server-Side Auth (`auth.ts`): [x]
        - Update Client-Side Auth (`betterauth-client.ts`): [x]
        - Implement UI Element for Portal Access: [x]
        - Test Customer Portal Access: [x]
    - **Enable Checkout:**
        - Update Server-Side Auth (`auth.ts`): [ ]
        - Implement UI Element for Checkout: [ ]
        - Create Success Page: [ ]
        - Test Checkout Flow: [ ]

## Milestone 4: (Future) Expand Polar Integration (Checkout & Portal)

This milestone will be detailed later and will cover the integration of Polar's checkout and customer portal functionalities.

### Subtasks:

- [ ] Define requirements for checkout.
- [ ] Define requirements for customer portal.
- [ ] Implement Polar checkout plugin in `auth.ts`.
- [ ] Update `betterauth-client.ts` for checkout and portal methods.
- [ ] Configure webhooks for order and subscription events.

## Progress Tracking:

- **Milestone 4:**
    - Define requirements for checkout: [ ]
    - Define requirements for customer portal: [ ]
    - Implement Polar checkout plugin in `auth.ts`: [ ]
    - Update `betterauth-client.ts` for checkout and portal methods: [ ]
    - Configure webhooks for order and subscription events: [ ] 