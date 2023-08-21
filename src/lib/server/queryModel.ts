import { buildPrompt } from "$lib/buildPrompt";
import type { Message } from "$lib/types/Message";
import { streamToAsyncIterable } from "$lib/utils/streamToAsyncIterable";
import { filter, flatMap, map, pipe } from "iter-ops";
import { modelEndpoint } from "./modelEndpoint";
import type { BackendModel, BackendModelHuggingFace } from "./models";
import type { TextGenerationStreamOutput } from "@huggingface/inference";
import { match } from "ts-pattern";

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
	webSearchId?: string
) {
	const randomEndpoint = modelEndpoint(model);

	const fetchHuggingface = async (modelHuggingface: BackendModelHuggingFace) => {
		const prompt = await buildPrompt(messages, modelHuggingface, webSearchId);
		const body = {
			inputs: prompt,
			stream: true,
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
		const postProcess = (output: TextGenerationStreamOutput) => {
			if (output.generated_text) {
				return {
					...output,
					generated_text: output.generated_text.startsWith(prompt)
						? output.generated_text.slice(prompt.length)
						: output.generated_text,
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
			stream: true,
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
		return [resp, (output: TextGenerationStreamOutput) => output] as const;
	};

	const [resp, postProcess] = await match(model)
		.with({ type: "huggingface" }, fetchHuggingface)
		.with({ type: "langchain" }, fetchLangchain)
		.exhaustive();

	if (!resp.body) {
		throw new Error("Response body is empty");
	}

	return [
		pipe(
			streamToAsyncIterable(resp.body),
			map((chunk) => new TextDecoder().decode(chunk)),
			flatMap((chunk) => chunk.split("\n")),
			filter((chunk) => chunk.trim().startsWith("data:")),
			map<string, TextGenerationStreamOutput>((chunk) => JSON.parse(chunk.trim().slice(5))),
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
	webSearchId?: string
) {
	const [stream, status, statusText] = await queryModel(
		model,
		messages,
		fetch,
		signal,
		webSearchId
	);
	for await (const output of stream) {
		if (output.generated_text) {
			return [output.generated_text, status, statusText] as const;
		}
	}
	throw new Error("No generated text");
}
