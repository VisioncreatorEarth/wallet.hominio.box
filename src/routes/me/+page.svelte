<script lang="ts">
	import { authClient } from '$lib/client/betterauth-client';

	const session = authClient.useSession();
</script>

protect me behind google auth

<div class="py-10 text-center">
	{#if $session.data?.user}
		<h1 class="mb-4 text-4xl font-bold">Welcome to your Profile!</h1>
		<p class="mb-2 text-lg">You are signed in.</p>
		<p class="text-md"><strong>Email:</strong> {$session.data.user.email || 'Not available'}</p>
		<p class="text-md"><strong>User ID:</strong> {$session.data.user.id}</p>

		<!-- You can display more user details from $session.data.user here -->
		<div
			class="mx-auto mt-6 max-w-2xl overflow-auto rounded bg-gray-100 p-4 text-left shadow-inner"
		>
			<h3 class="mb-2 text-lg font-semibold">Full Session Data (for debugging):</h3>
			<pre class="text-xs">{JSON.stringify($session.data, null, 2)}</pre>
		</div>
	{:else}
		<!-- This part should ideally not be reached due to the redirect in +layout.svelte -->
		<h1 class="mb-4 text-4xl font-bold">Access Denied</h1>
		<p class="text-lg">You need to be signed in to view this page.</p>
		<p class="mt-4"><a href="/" class="text-blue-600 hover:underline">Go to Homepage</a></p>
	{/if}
</div>
