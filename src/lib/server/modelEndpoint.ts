import { env } from "$env/dynamic/private";
import { sum } from "$lib/utils/sum";
import type { BackendModel } from "./models";

const { HF_ACCESS_TOKEN } = env;

/**
 * Find a random load-balanced endpoint
 */
export function modelEndpoint(model: BackendModel): {
	url: string;
	authorization: string;
	weight: number;
} {
	if (!model.endpoints) {
		return {
			url: `https://api-inference.huggingface.co/models/${model.name}`,
			authorization: `Bearer ${HF_ACCESS_TOKEN}`,
			weight: 1,
		};
	}
	const endpoints = model.endpoints;
	const totalWeight = sum(endpoints.map((e) => e.weight));

	let random = Math.random() * totalWeight;
	for (const endpoint of endpoints) {
		if (random < endpoint.weight) {
			return endpoint;
		}
		random -= endpoint.weight;
	}

	throw new Error("Invalid config, no endpoint found");
}
