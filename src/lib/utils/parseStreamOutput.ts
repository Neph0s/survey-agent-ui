import type { StreamOutput } from "$lib/types/StreamOutput";

export const parseStreamOutput = (chunk: string): StreamOutput => {
    const trimedChunk = chunk.trim();
    console.log(trimedChunk)
    if (trimedChunk.startsWith("data:")) {
        try {
            const data = JSON.parse(trimedChunk.slice("data:".length));
            return {
                type: "text",
                data,
            }
        } catch (e) {
            console.error("Error: ", trimedChunk)
            return {
                type: "text",
                data: {
                    token: {
                        id: -1,
                        text: "",
                        special: false,
                        logprob: 0
                    },
                    generated_text: null,
                    details: null
                }
            }
        }


    } else if (trimedChunk.startsWith("action:")) {
        const data = JSON.parse(trimedChunk.slice("action:".length));
        return {
            type: "action",
            name: data.name,
            message: data.message,
        }
    } else if (trimedChunk.startsWith("error:")) {
        const data = JSON.parse(trimedChunk.slice("error:".length));
        return {
            type: "error",
            message: data.message,
        }
    }
    throw new Error("Could not parse stream output");
}

export const serializeStreamOutput = (output: StreamOutput): string => {
    switch (output.type) {
        case "action":
            return `action:${JSON.stringify({
                name: output.name,
                message: output.message,
            })}`;
        case "text":
            return `data:${JSON.stringify(output.data)}`;
        case "error":
            return `error:${JSON.stringify({
                message: output.message,
            })}`;
    }
}