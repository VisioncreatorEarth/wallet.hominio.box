<script lang="ts">
	import { authClient } from '$lib/client/betterauth-client';

	const session = authClient.useSession();
	let activeTab = 'userDetails'; // Default active tab

	const tabs = [
		{ id: 'userDetails', label: 'User Details' },
		{ id: 'sessionInfo', label: 'Session Information' },
		{ id: 'passkeyDetails', label: 'Passkey Details' },
		{ id: 'rawDebug', label: 'Raw Debug Data' }
	];

	function formatKey(key: string): string {
		return key
			.replace(/([A-Z])/g, ' $1') // Add space before uppercase letters
			.replace(/^./, (str) => str.toUpperCase()); // Capitalize first letter
	}
</script>

<div class="bg-linen font-ibm-plex-sans text-prussian-blue min-h-screen p-4 pt-8 md:p-8">
	<div class="mx-auto max-w-6xl">
		{#if $session.data?.user}
			{@const allData = $session.data as any}
			{@const userDetails = allData.user}
			{@const sessionInfo = allData.session}
			{@const pkpPasskeyData = userDetails?.pkp_passkey}
			{@const knownTopLevelKeys = ['user', 'session']}

			<header class="mb-10 text-center md:text-left">
				<h1 class="font-playfair-display text-prussian-blue text-4xl font-normal md:text-5xl">
					Account Settings
				</h1>
				<p class="text-prussian-blue/80 mt-1 text-lg">Manage your profile and session details.</p>
			</header>

			<div class="flex flex-col gap-8 md:flex-row md:gap-10">
				<!-- Aside Navigation -->
				<aside class="w-full md:w-1/4">
					<nav class="space-y-2">
						{#each tabs as tab}
							{#if tab.id === 'passkeyDetails' && !pkpPasskeyData}
								<!-- Do not render Passkey Details tab if pkpPasskeyData is not present -->
							{:else}
								<button
									onclick={() => (activeTab = tab.id)}
									class="{activeTab === tab.id
										? 'bg-buff text-prussian-blue'
										: 'text-prussian-blue/80 hover:bg-timberwolf-1/50'} focus:ring-persian-orange focus:ring-opacity-50 w-full rounded-lg p-3 text-left text-sm font-medium transition-colors duration-150 focus:ring-2 focus:outline-none"
								>
									{tab.label}
								</button>
							{/if}
						{/each}
					</nav>
				</aside>

				<!-- Main Content Area -->
				<main class="w-full flex-1 space-y-6 md:w-3/4">
					<!-- User Details Section -->
					{#if activeTab === 'userDetails' && userDetails}
						<div class="rounded-xl bg-white p-6 shadow-lg">
							<h3
								class="border-timberwolf-2/70 text-prussian-blue mb-5 border-b pb-3 text-xl font-semibold"
							>
								User Details
							</h3>
							<div class="space-y-3">
								{#if userDetails.email}
									<div
										class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-center"
									>
										<span class="text-prussian-blue/80 font-medium">Email:</span>
										<span class="text-prussian-blue">{userDetails.email}</span>
									</div>
								{/if}
								{#if userDetails.id}
									<div
										class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-center"
									>
										<span class="text-prussian-blue/80 font-medium">User ID:</span>
										<span class="text-prussian-blue">{userDetails.id}</span>
									</div>
								{/if}
								{#if userDetails.name && userDetails.name !== userDetails.email}
									<div
										class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-center"
									>
										<span class="text-prussian-blue/80 font-medium">Name:</span>
										<span class="text-prussian-blue">{userDetails.name}</span>
									</div>
								{/if}
								{#each Object.entries(userDetails) as [key, value]}
									{@const fieldsToSkip = ['email', 'id', 'name', 'pkp_passkey']}
									{#if !fieldsToSkip.includes(key)}
										<div
											class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-start"
										>
											<span class="text-prussian-blue/80 font-medium">{formatKey(key)}:</span>
											{#if typeof value === 'object' && value !== null}
												<pre
													class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs sm:mt-0 sm:w-auto sm:max-w-md md:max-w-lg"><code
														>{JSON.stringify(value, null, 2)}</code
													></pre>
											{:else}
												<span class="text-prussian-blue text-sm">{String(value ?? 'N/A')}</span>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{/if}

					<!-- Session Information Section -->
					{#if activeTab === 'sessionInfo' && sessionInfo}
						<div class="rounded-xl bg-white p-6 shadow-lg">
							<h3
								class="border-timberwolf-2/70 text-prussian-blue mb-5 border-b pb-3 text-xl font-semibold"
							>
								Session Information
							</h3>
							<div class="space-y-3">
								{#each Object.entries(sessionInfo) as [key, value]}
									<div
										class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-start"
									>
										<span class="text-prussian-blue/80 font-medium">{formatKey(key)}:</span>
										{#if typeof value === 'object' && value !== null}
											<pre
												class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs sm:mt-0 sm:w-auto sm:max-w-md md:max-w-lg"><code
													>{JSON.stringify(value, null, 2)}</code
												></pre>
										{:else}
											<span class="text-prussian-blue text-sm break-all"
												>{String(value ?? 'N/A')}</span
											>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Passkey Details Section -->
					{#if activeTab === 'passkeyDetails' && pkpPasskeyData}
						<div class="rounded-xl bg-white p-6 shadow-lg">
							<h3
								class="border-timberwolf-2/70 text-prussian-blue mb-5 border-b pb-3 text-xl font-semibold"
							>
								Passkey Details
							</h3>
							<div class="space-y-3">
								{#each Object.entries(pkpPasskeyData) as [key, value]}
									<div
										class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-start"
									>
										<span class="text-prussian-blue/80 font-medium">{formatKey(key)}:</span>
										{#if typeof value === 'object' && value !== null}
											<pre
												class="bg-timberwolf-1/40 text-prussian-blue/90 mt-1 w-full overflow-auto rounded-md p-2 text-xs sm:mt-0 sm:w-auto sm:max-w-md md:max-w-lg"><code
													>{JSON.stringify(value, null, 2)}</code
												></pre>
										{:else}
											<span class="text-prussian-blue text-sm break-all"
												>{String(value ?? 'N/A')}</span
											>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Raw Debug Data Section -->
					{#if activeTab === 'rawDebug'}
						<div class="rounded-xl bg-white p-6 shadow-lg">
							<h3
								class="border-timberwolf-2/70 text-prussian-blue mb-5 border-b pb-3 text-xl font-semibold"
							>
								Full Raw Session Data (Debug)
							</h3>
							<div class="bg-prussian-blue overflow-auto rounded-lg p-4 text-left shadow-inner">
								<pre class="text-linen text-xs">{JSON.stringify(allData, null, 2)}</pre>
							</div>
						</div>
					{/if}
				</main>
			</div>
		{:else}
			<!-- This part should ideally not be reached due to the redirect in +layout.svelte -->
			<div class="py-16 text-center">
				<h1 class="font-playfair-display text-prussian-blue mb-6 text-4xl font-normal md:text-5xl">
					Access Denied
				</h1>
				<p class="text-prussian-blue/80 text-xl">You need to be signed in to view this page.</p>
				<p class="mt-10">
					<a
						href="/"
						class="font-ibm-plex-sans bg-prussian-blue text-linen focus:ring-persian-orange focus:ring-opacity-50 inline-block rounded-full px-10 py-3 text-lg font-bold shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus:ring-2 focus:outline-none"
					>
						Go to Homepage
					</a>
				</p>
			</div>
		{/if}
	</div>
</div>
