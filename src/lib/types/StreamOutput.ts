import type { TextGenerationStreamOutput } from "@huggingface/inference";
import type { ActionMessage } from "./Action";

export type ActionStreamOutput = {
    type: "action";
    name: string;
    message: ActionMessage;
};

export type TextStreamOutput = {
    type: "text";
    data: TextGenerationStreamOutput
}

export type ErrorStreamOutput = {
    type: "error";
    message: string;
};

export type StreamOutput = ActionStreamOutput | TextStreamOutput | ErrorStreamOutput;