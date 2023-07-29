import { buildPrompt } from "$lib/buildPrompt";
import type { Message } from "$lib/types/Message";
import { streamToAsyncIterable } from "$lib/utils/streamToAsyncIterable";
import { filter, flatMap, map, pipe } from "iter-ops";
import { modelEndpoint } from "./modelEndpoint";
import type { BackendModel } from "./models";
import type { TextGenerationStreamOutput } from "@huggingface/inference";

/**
 * Query a random model endpoint with given messages. Can be aborted with signal.
 * 
 * Returns async iterator of responses.
 */
export async function queryModel(model: BackendModel, messages: Message[], fetch = window.fetch, signal?: AbortSignal, webSearchId?: string) {
    const randomEndpoint = modelEndpoint(model);
    console.log(model, messages)

    const prompt = model.type === "huggingface" ? await buildPrompt(messages, model, webSearchId) : ""
    let body
    if (model.type === "huggingface") {
        body = {
            inputs: prompt,
            stream: true,
            parameters: {
                ...model.parameters,
                return_full_text: false
            }
        }
    } else {
        body = {
            messages,
            stream: true,
            parameters: model.parameters
        }
    }
    const resp = await fetch(randomEndpoint.url, {
        headers: {
            "Content-Type": "application/json",
            Authorization: randomEndpoint.authorization,
        },
        method: "POST",
        body: JSON.stringify(body),
        signal
    });

    if (!resp.body) {
        throw new Error("Response body is empty");
    }

    return [pipe(
        streamToAsyncIterable(resp.body),
        map((chunk) => new TextDecoder().decode(chunk)),
        flatMap((chunk) => chunk.split("\n")),
        filter((chunk) => chunk.trim().startsWith("data:")),
        map<string, TextGenerationStreamOutput>((chunk) => JSON.parse(chunk.trim().slice(5))),
        map((output) => ({
            ...output,
            generated_text: output.generated_text?.startsWith(prompt) ? output.generated_text.slice(prompt.length) : output.generated_text
        }))
    ), resp.status, resp.statusText] as const;
}

export async function queryModelNoStreaming(model: BackendModel, messages: Message[], fetch = window.fetch, signal?: AbortSignal, webSearchId?: string) {
    const [stream, status, statusText] = await queryModel(model, messages, fetch, signal, webSearchId);
    for await (const output of stream) {
        if (output.generated_text) {
            return [output.generated_text, status, statusText] as const;
        }
    }
    throw new Error("No generated text");
}