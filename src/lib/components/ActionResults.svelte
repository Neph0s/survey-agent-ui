<script lang="ts">
	import type { Action } from "$lib/types/Action";
	import CarbonCaretRight from "~icons/carbon/caret-right";

	import CarbonCheckmark from "~icons/carbon/checkmark-filled";
	import CarbonError from "~icons/carbon/error-filled";

	import EosIconsLoading from "~icons/eos-icons/loading";

	export let classNames = "";
	export let action: Action;
	$: actionMessages = action.messages;

	let detailsOpen: boolean;
	$: loading = actionMessages[actionMessages.length - 1]?.type === "update";
	$: error = actionMessages[actionMessages.length - 1]?.type === "error";
</script>

<details
	class="flex w-fit rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 {classNames} max-w-full"
	bind:open={detailsOpen}
>
	<summary
		class="align-center flex cursor-pointer select-none list-none py-1 pl-2.5 pr-2 align-text-top transition-all"
	>
		{#if error}
			<CarbonError class="my-auto text-red-700 dark:text-red-500" />
		{:else if loading}
			<EosIconsLoading class="my-auto text-gray-500" />
		{:else}
			<CarbonCheckmark class="my-auto text-gray-500" />
		{/if}
		<span class="px-2 font-medium" class:text-red-700={error} class:dark:text-red-500={error}>
			{action.name}
		</span>
		<div class="my-auto transition-all" class:rotate-90={detailsOpen}>
			<CarbonCaretRight />
		</div>
	</summary>

	<div class="content px-5 pb-5 pt-4">
		{#if actionMessages.length === 0}
			<div class="mx-auto w-fit">
				<EosIconsLoading class="mb-3 h-4 w-4" />
			</div>
		{:else}
			<ol>
				{#each actionMessages as message}
					{#if message.type === "update"}
						<li class="group border-l pb-6 last:!border-transparent last:pb-0 dark:border-gray-800">
							<div class="flex items-start">
								<div
									class="-ml-1.5 h-3 w-3 flex-none rounded-full bg-gray-200 dark:bg-gray-600 {loading
										? 'group-last:animate-pulse group-last:bg-gray-300 group-last:dark:bg-gray-500'
										: ''}"
								/>
								<h3 class="text-md -mt-1.5 pl-2.5 text-gray-800 dark:text-gray-100">
									{message.message}
								</h3>
							</div>
							{#if message.args}
								<p class="mt-1.5 pl-4 text-gray-500 dark:text-gray-400">
									{message.args}
								</p>
							{/if}
						</li>
					{:else if message.type === "error"}
						<li class="group border-l pb-6 last:!border-transparent last:pb-0 dark:border-gray-800">
							<div class="flex items-start">
								<CarbonError
									class="-ml-1.5 h-3 w-3 flex-none scale-110 text-red-700 dark:text-red-500"
								/>
								<h3 class="text-md -mt-1.5 pl-2.5 text-red-700 dark:text-red-500">
									{message.message}
								</h3>
							</div>
							{#if message.args}
								<p class="mt-1.5 pl-4 text-gray-500 dark:text-gray-400">
									{message.args}
								</p>
							{/if}
						</li>
					{:else if message.type === "result"}
						<li class="group border-l pb-6 last:!border-transparent last:pb-0 dark:border-gray-800">
							<div class="flex items-start">
								<CarbonCheckmark
									class="-ml-1.5 h-3 w-3 flex-none scale-110 text-green-700 dark:text-green-500"
								/>
								<h3 class="text-md -mt-1.5 pl-2.5 text-black dark:text-white">
									{message.message}
								</h3>
							</div>
						</li>
					{/if}
				{/each}
			</ol>
		{/if}
	</div>
</details>

<style>
	@keyframes grow {
		0% {
			font-size: 0;
			opacity: 0;
		}
		30% {
			font-size: 1em;
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	details[open] .content {
		animation-name: grow;
		animation-duration: 300ms;
		animation-delay: 0ms;
	}

	details summary::-webkit-details-marker {
		display: none;
	}
</style>
