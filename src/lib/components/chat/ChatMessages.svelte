<script lang="ts">
	import type { Message } from "$lib/types/Message";
	import { snapScrollToBottom } from "$lib/actions/snapScrollToBottom";
	import ScrollToBottomBtn from "$lib/components/ScrollToBottomBtn.svelte";
	import { tick } from "svelte";
	import { randomUUID } from "$lib/utils/randomUuid";
	import type { Model } from "$lib/types/Model";
	import type { LayoutData } from "../../../routes/$types";
	import ChatIntroduction from "./ChatIntroduction.svelte";
	import ChatMessage from "./ChatMessage.svelte";

	export let messages: Message[];
	export let loading: boolean;
	export let pending: boolean;
	export let isAuthor: boolean;
	export let currentModel: Model;
	export let settings: LayoutData["settings"];
	export let models: Model[];
	export let readOnly: boolean;

	let chatContainer: HTMLElement;

	async function scrollToBottom() {
		await tick();
		chatContainer.scrollTop = chatContainer.scrollHeight;
	}

	// If last message is from user, scroll to bottom
	$: if (messages[messages.length - 1]?.from === "user") {
		scrollToBottom();
	}
</script>

<div
	class="scrollbar-custom mr-1 h-full overflow-y-auto"
	use:snapScrollToBottom={messages.length ? [...messages] : false}
	bind:this={chatContainer}
>
	<div class="mx-auto flex h-full max-w-3xl flex-col gap-6 px-5 pt-6 sm:gap-8 xl:max-w-4xl">
		{#each messages as message, i}
			<ChatMessage
				loading={loading && i === messages.length - 1}
				{message}
				{isAuthor}
				{readOnly}
				model={currentModel}
				on:retry
				on:vote
			/>
		{:else}
			<ChatIntroduction {settings} {models} {currentModel} on:message />
		{/each}
		{#if pending}
			<ChatMessage
				message={{ from: "assistant", content: "", id: randomUUID() }}
				model={currentModel}
			/>
		{/if}
		<div class="h-44 flex-none" />
	</div>
	<ScrollToBottomBtn
		class="bottom-36 right-4 max-md:hidden lg:right-10"
		scrollNode={chatContainer}
	/>
</div>
