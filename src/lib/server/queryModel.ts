import { buildPrompt } from "$lib/buildPrompt";
import type { Message } from "$lib/types/Message";
import { streamToAsyncIterable } from "$lib/utils/streamToAsyncIterable";
import { filter, flatMap, map, pipe } from "iter-ops";
import { modelEndpoint } from "./modelEndpoint";
import type { BackendModel, BackendModelHuggingFace } from "./models";
import { match } from "ts-pattern";
import { canParseStreamOutput, parseStreamOutput } from "$lib/utils/parseStreamOutput";
import type { StreamOutput } from "$lib/types/StreamOutput";
import { env } from "$env/dynamic/private";

const { MODEL_STREAMING } = env
const streaming = MODEL_STREAMING === 'true'

/**
 * Query a random model endpoint with given messages. Can be aborted with signal.
 *
 * Returns async iterator of responses.
 */
export async function queryModel(
	model: BackendModel,
	messages: Message[],
	fetch = window.fetch,
	signal?: AbortSignal,
	conversationInfo?: { userId: string; conversationId: string },
) {
	const randomEndpoint = modelEndpoint(model);

	const fetchHuggingface = async (modelHuggingface: BackendModelHuggingFace) => {
		const prompt = await buildPrompt(messages, modelHuggingface);
		const body = {
			inputs: prompt,
			stream: streaming,
			parameters: {
				...modelHuggingface.parameters,
				return_full_text: false,
			},
		};
		const resp = await fetch(randomEndpoint.url, {
			headers: {
				"Content-Type": "application/json",
				Authorization: randomEndpoint.authorization,
			},
			method: "POST",
			body: JSON.stringify(body),
			signal,
		});
		const postProcess = (output: StreamOutput) => {
			if (output.type === 'text' && output.data.generated_text) {
				return {
					...output,
					data: {
						...output.data,
						generated_text: output.data.generated_text.startsWith(prompt)
							? output.data.generated_text.slice(prompt.length)
							: output.data.generated_text,
					}
				};
			}
			return output;
		};
		return [resp, postProcess] as const;
	};

	const fetchLangchain = async () => {
		const systemMessages = {
			from: "system",
			content: model.preprompt,
		};
		const body = {
			messages: [systemMessages, ...messages],
			stream: streaming,
			parameters: model.parameters,
		};
		const resp = await fetch(randomEndpoint.url, {
			headers: {
				"Content-Type": "application/json",
				Authorization: randomEndpoint.authorization,
			},
			method: "POST",
			body: JSON.stringify(body),
			signal,
		});
		return [resp, (output: StreamOutput) => output] as const;
	};

	const fetchChatDoc = async () => {
		const body = {
			messages: [...messages].map((m) => ({
				type: m.from,
				content: m.content,
			})),
			stream: streaming,
			conversationInfo
		};
		const resp = await fetch(randomEndpoint.url, {
			headers: {
				"Content-Type": "application/json",
			},
			method: "POST",
			body: JSON.stringify(body),
			signal,
		});
		return [resp, (output: StreamOutput) => output] as const;
	};

	const [resp, postProcess] = await match(model)
		.with({ type: "huggingface" }, fetchHuggingface)
		.with({ type: "langchain" }, fetchLangchain)
		.with({ type: "chatdoc" }, fetchChatDoc)
		.exhaustive();

	if (!resp.body) {
		throw new Error("Response body is empty");
	}

	return [
		pipe(
			streamToAsyncIterable(resp.body),
			map((chunk) => new TextDecoder().decode(chunk)),
			flatMap((chunk) => chunk.split("\n")),
			filter((chunk) => chunk.trim() !== ""),
			map((chunk, index, state) => {
				if (!state['pastOutput']) state['pastOutput'] = ''
				if (canParseStreamOutput(state['pastOutput'] + chunk)) {
					const output = state['pastOutput'] + chunk
					state['pastOutput'] = ''
					return output
				} else {
					state['pastOutput'] += chunk
					state['pastOutput'] = state['pastOutput'].trim()
					return ''
				}
			}),
			filter((chunk) => chunk.trim() !== ""),
			map((chunk) => parseStreamOutput(chunk)),
			map(postProcess)
		),
		resp.status,
		resp.statusText,
	] as const;
}

export async function queryModelNoStreaming(
	model: BackendModel,
	messages: Message[],
	fetch = window.fetch,
	signal?: AbortSignal,
) {
	const [stream, status, statusText] = await queryModel(
		model,
		messages,
		fetch,
		signal,
	);
	for await (const output of stream) {
		if (output.type === "text" && output.data.generated_text) {
			return [output.data.generated_text, status, statusText] as const;
		}
	}
	throw new Error("No generated text");
}
