<script lang="ts">
	import { marked } from "marked";
	import type { Message } from "$lib/types/Message";
	import { afterUpdate, createEventDispatcher, onDestroy } from "svelte";
	import { deepestChild } from "$lib/utils/deepestChild";
	import { page } from "$app/stores";

	import CodeBlock from "../CodeBlock.svelte";
	import IconLoading from "../icons/IconLoading.svelte";
	import CarbonRotate360 from "~icons/carbon/rotate-360";
	import CarbonDownload from "~icons/carbon/download";
	import CarbonThumbsUp from "~icons/carbon/thumbs-up";
	import CarbonThumbsDown from "~icons/carbon/thumbs-down";
	import { PUBLIC_SEP_TOKEN } from "$lib/constants/publicSepToken";
	import type { Model } from "$lib/types/Model";

	import ActionResults from "../ActionResults.svelte";
	import IconCopy from "../icons/IconCopy.svelte";
	import Tooltip from "../Tooltip.svelte";

	function sanitizeMd(md: string) {
		let ret = md
			.replace(/<\|[a-z]*$/, "")
			.replace(/<\|[a-z]+\|$/, "")
			.replace(/<$/, "")
			.replaceAll(PUBLIC_SEP_TOKEN, " ")
			.replaceAll(/<\|[a-z]+\|>/g, " ")
			.replaceAll(/<br\s?\/?>/gi, "\n")
			// .replaceAll("<", "&lt;")
			.trim();

		if (model.type === "huggingface") {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			for (const stop of [...((model.parameters as any).stop ?? []), "<|endoftext|>"]) {
				if (ret.endsWith(stop)) {
					ret = ret.slice(0, -stop.length).trim();
				}
			}
		}

		return ret;
	}

	function unsanitizeMd(md: string) {
		return md.replaceAll("&lt;", "<");
	}

	function getCopiableText(tokens: marked.TokensList) {
		let copiableText = "";
		for (const token of tokens) {
			if ("text" in token) {
				copiableText += unsanitizeMd(token.text) + "\n";
			} else if (token.type === "hr") {
				break;
			}
		}
		return copiableText.trim();
	}

	export let model: Model;
	export let message: Message;
	export let loading = false;
	export let isAuthor = true;
	export let readOnly = false;
	export let isTapped = false;

	$: actions = message.actions ?? [];

	const dispatch = createEventDispatcher<{
		retry: { content: string; id: Message["id"] };
		vote: { score: Message["score"]; id: Message["id"] };
	}>();

	let contentEl: HTMLElement;
	let loadingEl: IconLoading;
	let pendingTimeout: ReturnType<typeof setTimeout>;

	const renderer = new marked.Renderer();

	// For code blocks with simple backticks
	renderer.codespan = (code) => {
		// Unsanitize double-sanitized code
		return `<code>${code.replaceAll("&amp;", "&")}</code>`;
	};

	const options: marked.MarkedOptions = {
		...marked.getDefaults(),
		gfm: true,
		breaks: true,
		renderer,
	};

	$: tokens = marked.lexer(sanitizeMd(message.content));
	$: copiableText = getCopiableText(tokens);

	let isCopySuccess = false;
	let copyTimeout: ReturnType<typeof setTimeout>;

	const handleCopy = async () => {
		// writeText() can be unavailable or fail in some cases (iframe, etc) so we try/catch
		try {
			await navigator.clipboard.writeText(copiableText);

			isCopySuccess = true;
			if (copyTimeout) {
				clearTimeout(copyTimeout);
			}
			copyTimeout = setTimeout(() => {
				isCopySuccess = false;
			}, 1000);
		} catch (err) {
			console.error(err);
		}
	};

	onDestroy(() => {
		if (copyTimeout) {
			clearTimeout(copyTimeout);
		}
	});

	afterUpdate(() => {
		loadingEl?.$destroy();
		clearTimeout(pendingTimeout);

		// Add loading animation to the last message if update takes more than 600ms
		if (loading) {
			pendingTimeout = setTimeout(() => {
				if (contentEl) {
					loadingEl = new IconLoading({
						target: deepestChild(contentEl),
						props: { classNames: "loading inline ml-2" },
					});
				}
			}, 600);
		}
	});

	$: downloadLink =
		message.from === "user" ? `${$page.url.pathname}/message/${message.id}/prompt` : undefined;
</script>

{#if message.from === "assistant"}
	<div
		class="group relative -mb-8 flex items-start justify-start gap-4 pb-8 leading-relaxed"
		on:click={() => (isTapped = !isTapped)}
		on:keypress={() => (isTapped = !isTapped)}
	>
		<img
			alt=""
			src="https://huggingface.co/avatars/2edb18bd0206c16b433841a47f53fa8e.svg"
			class="h-8 w-8 flex-none select-none self-center rounded-full shadow-lg"
		/>
		<div
			class="relative min-h-[calc(2rem+theme(spacing[3.5])*2)] min-w-[60px] break-words rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 px-5 py-3.5 text-gray-600 prose-pre:my-2 dark:border-gray-800 dark:from-gray-800/40 dark:text-gray-300"
		>
			{#each actions as action}
				<ActionResults classNames={tokens.length ? "mb-3.5" : ""} {action} />
			{/each}
			{#if !message.content}
				<IconLoading />
			{/if}

			<div
				class="prose max-w-none dark:prose-invert max-sm:prose-sm prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 dark:prose-pre:bg-gray-900"
				bind:this={contentEl}
			>
				{#each tokens as token}
					{#if token.type === "code"}
						<CodeBlock lang={token.lang} code={unsanitizeMd(token.text)} />
					{:else}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html marked(token.raw, options)}
					{/if}
				{/each}
			</div>
		</div>
		{#if isAuthor && !loading && message.content}
			<div
				class="absolute bottom-1 right-0 flex max-md:transition-all md:bottom-0 md:group-hover:visible md:group-hover:opacity-100
					{message.score ? 'visible opacity-100' : 'invisible max-md:-translate-y-4 max-md:opacity-0'}
					{isTapped ? 'max-md:visible max-md:translate-y-0 max-md:opacity-100' : ''}
				"
			>
				<button
					class="btn rounded-sm p-1 text-sm text-gray-400 hover:text-gray-500 focus:ring-0 dark:text-gray-400 dark:hover:text-gray-300"
					title="复制回答"
					type="button"
					on:click={handleCopy}
				>
					<span class="relative">
						<IconCopy classNames="h-[1.14em] w-[1.14em]" />
						<Tooltip classNames={isCopySuccess ? "opacity-100" : "opacity-0"} />
					</span>
				</button>
				<span class="mx-1 border-r border-gray-300 dark:border-gray-600" />
				<button
					class="btn rounded-sm p-1 text-sm text-gray-400 hover:text-gray-500 focus:ring-0 dark:text-gray-400 dark:hover:text-gray-300
					{message.score && message.score > 0
						? 'text-green-500 hover:text-green-500 dark:text-green-400 hover:dark:text-green-400'
						: ''}"
					title={message.score === 1 ? "Remove +1" : "+1"}
					type="button"
					on:click={() => dispatch("vote", { score: message.score === 1 ? 0 : 1, id: message.id })}
				>
					<CarbonThumbsUp class="h-[1.14em] w-[1.14em]" />
				</button>
				<button
					class="btn rounded-sm p-1 text-sm text-gray-400 hover:text-gray-500 focus:ring-0 dark:text-gray-400 dark:hover:text-gray-300
					{message.score && message.score < 0
						? 'text-red-500 hover:text-red-500 dark:text-red-400 hover:dark:text-red-400'
						: ''}"
					title={message.score === -1 ? "Remove -1" : "-1"}
					type="button"
					on:click={() =>
						dispatch("vote", { score: message.score === -1 ? 0 : -1, id: message.id })}
				>
					<CarbonThumbsDown class="h-[1.14em] w-[1.14em]" />
				</button>
			</div>
		{/if}
	</div>
{/if}
{#if message.from === "user"}
	<div class="group relative flex items-start justify-start gap-4 max-sm:text-sm">
		<img
			alt=""
			src="/user/avatar"
			class="h-8 w-8 flex-none select-none self-center rounded-full shadow-lg"
		/>
		<div
			class="max-w-full whitespace-break-spaces break-words rounded-2xl px-5 py-3.5 text-gray-500 dark:text-gray-400"
		>
			{message.content.trim()}
		</div>
		{#if !loading}
			<div class="absolute right-0 top-3.5 flex gap-2 lg:-right-2">
				{#if downloadLink}
					<a
						class="rounded-lg border border-gray-100 p-1 text-xs text-gray-400 group-hover:block hover:text-gray-500 dark:border-gray-800 dark:text-gray-400 dark:hover:text-gray-300 md:hidden"
						title="Download prompt and parameters"
						type="button"
						target="_blank"
						href={downloadLink}
					>
						<CarbonDownload />
					</a>
				{/if}
				{#if !readOnly}
					<button
						class="cursor-pointer rounded-lg border border-gray-100 p-1 text-xs text-gray-400 group-hover:block hover:text-gray-500 dark:border-gray-800 dark:text-gray-400 dark:hover:text-gray-300 md:hidden lg:-right-2"
						title="Retry"
						type="button"
						on:click={() => dispatch("retry", { content: message.content, id: message.id })}
					>
						<CarbonRotate360 />
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}
