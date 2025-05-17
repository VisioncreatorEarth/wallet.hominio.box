<script lang="ts">
	// Define a more specific type if possible, based on your actual userDetails structure
	// For now, using a general type.
	export let userDetails:
		| {
				pkp_passkey?: any;
				image?: string;
				picture?: string;
				name?: string;
				email?: string;
				id?: string;
				[key: string]: any;
		  }
		| null
		| undefined = null;

	function formatKey(key: string): string {
		return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
	}
</script>

{#if userDetails}
	{@const profileImageUrl = userDetails.image || userDetails.picture}
	<div class="bg-background-surface rounded-xl p-6 shadow-xs">
		<div class="flex flex-col items-center pt-1">
			{#if profileImageUrl}
				<img
					src={profileImageUrl}
					alt="Profile"
					class="mb-4 h-24 w-24 rounded-full object-cover shadow-md md:h-32 md:w-32"
				/>
			{:else}
				<div
					class="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-3xl font-semibold text-slate-600 shadow-md md:h-32 md:w-32"
				>
					{userDetails.name
						? userDetails.name.charAt(0).toUpperCase()
						: userDetails.email
							? userDetails.email.charAt(0).toUpperCase()
							: '?'}
				</div>
			{/if}

			{#if userDetails.name && userDetails.name !== userDetails.email}
				<h4 class="text-prussian-blue mb-1 text-center text-xl font-semibold md:text-2xl">
					{userDetails.name}
				</h4>
			{/if}

			{#if userDetails.email}
				<p class="text-prussian-blue/80 mb-6 text-center text-sm">
					{userDetails.email}
				</p>
			{/if}

			<hr class="border-timberwolf-2/50 mb-6 w-full border-t" />

			<div class="w-full space-y-3">
				{#if userDetails.id}
					<div
						class="border-timberwolf-2/50 flex flex-col justify-between border-b py-2 last:border-b-0 sm:flex-row sm:items-center"
					>
						<span class="text-prussian-blue/80 font-medium">User ID:</span>
						<span class="text-prussian-blue">{userDetails.id}</span>
					</div>
				{/if}
				{#each Object.entries(userDetails) as [key, value]}
					{@const fieldsToSkip = ['email', 'id', 'name', 'pkp_passkey', 'image', 'picture']}
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
	</div>
{/if}
