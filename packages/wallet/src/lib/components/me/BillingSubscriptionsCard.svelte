<script lang="ts">
	import type { ClientPkpPasskey } from '$lib/client/pkp-passkey-plugin';

	let { authClient, currentPkpData } = $props<{
		authClient: any; // Replace with specific type if available
		currentPkpData: ClientPkpPasskey | null;
	}>();

	// State variables for price fetching removed

	async function goToBillingPortal() {
		try {
			await authClient.customer.portal();
		} catch (error) {
			console.error('[BillingCard] Error redirecting to Polar portal:', error);
			alert('Could not redirect to billing portal. Please try again later.');
		}
	}

	async function startCheckout() {
		try {
			await authClient.checkout({ slug: 'vibe-creator' });
		} catch (error) {
			console.error('[BillingCard] Error initiating checkout:', error);
			alert('Could not start the checkout process. Please try again later.');
		}
	}

	// $effect for fetching price removed
</script>

<div class="bg-background-surface rounded-xl p-6 shadow-xs">
	<div class="space-y-8 pt-1">
		<section>
			<h3 class="font-playfair-display text-prussian-blue mb-4 text-xl">
				Manage Existing Services
			</h3>
			<p class="text-prussian-blue/80 mb-6 text-sm">
				Click the button below to securely access your customer portal. You can view your orders,
				manage subscriptions, and update payment methods.
			</p>
			<button
				onclick={goToBillingPortal}
				class="bg-prussian-blue text-linen focus:ring-prussian-blue/70 hover:bg-opacity-90 rounded-lg px-5 py-2.5 text-sm font-medium shadow-md transition-colors focus:ring-2 focus:outline-none"
			>
				Go to Customer Portal
			</button>
		</section>

		<hr class="border-timberwolf-2/30" />

		<section>
			<h3 class="font-playfair-display text-prussian-blue mb-4 text-xl">Purchase New Services</h3>
			<p class="text-prussian-blue/80 mb-2 text-sm">VibeCreator Plan $100/month (excl. VAT)</p>
			<p class="text-prussian-blue/70 mb-6 text-xs">
				Access to all standard features, perfect for individual users.
			</p>
			<button
				onclick={startCheckout}
				class="bg-persian-orange text-linen focus:ring-persian-orange/70 hover:bg-opacity-90 rounded-lg px-5 py-2.5 text-sm font-medium shadow-md transition-colors focus:ring-2 focus:outline-none"
			>
				Purchase VibeCreator Plan
			</button>
		</section>
	</div>
</div>
