import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { FunctionDeclaration, GenerateContentResponse } from '@google/genai';
import { emptyUsage, addUsage, withRetry, MIME_TYPES, type UsageStats, type ToolDeclaration } from './ai-adapter.js';

const MODEL = 'gemini-3-flash-preview';
const INPUT_PRICE_PER_M = 0.5;
const OUTPUT_PRICE_PER_M = 3.0;

function extractUsage(response: GenerateContentResponse): UsageStats {
    const meta = response.usageMetadata;
    const input = meta?.promptTokenCount ?? 0;
    const output = meta?.candidatesTokenCount ?? 0;
    const inputCost = (input / 1_000_000) * INPUT_PRICE_PER_M;
    const outputCost = (output / 1_000_000) * OUTPUT_PRICE_PER_M;
    return {
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
    };
}

function getClient(): GoogleGenAI {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY environment variable is not set. See README.md for setup instructions.');
    }
    return new GoogleGenAI({ apiKey });
}

export async function analyzeDocument(filePath: string, prompt: string, onStatus?: (s: string) => void): Promise<{ text: string; usage: UsageStats }> {
    const ai = getClient();
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext];
    if (!mimeType) {
        throw new Error(`Unsupported file type: ${ext}`);
    }

    const fileData = fs.readFileSync(filePath);
    const base64 = fileData.toString('base64');

    const response = await withRetry(
        () =>
            ai.models.generateContent({
                model: MODEL,
                contents: [
                    {
                        role: 'user',
                        parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }],
                    },
                ],
            }),
        onStatus,
    );

    const text = response.text ?? '';
    return { text, usage: extractUsage(response) };
}

export async function chatWithTools(
    prompt: string,
    tools: ToolDeclaration[],
    executeToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    onStatus?: (s: string) => void,
): Promise<{ text: string; usage: UsageStats }> {
    const ai = getClient();

    const functionDeclarations: FunctionDeclaration[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parametersJsonSchema: t.parameters as FunctionDeclaration['parametersJsonSchema'],
    }));

    let totalUsage = emptyUsage();

    const chat = ai.chats.create({
        model: MODEL,
        config: {
            tools: [{ functionDeclarations }],
        },
    });

    let response = await withRetry(() => chat.sendMessage({ message: prompt }), onStatus);
    totalUsage = addUsage(totalUsage, extractUsage(response));

    while (response.functionCalls && response.functionCalls.length > 0) {
        const functionResponses: { name: string; id: string; response: Record<string, unknown> }[] = [];
        for (const call of response.functionCalls) {
            const argsPreview = call.args ? Object.values(call.args).join(', ') : '';
            onStatus?.(`${call.name}(${argsPreview})`);
            const result = await executeToolCall(call.name!, call.args as Record<string, unknown>);
            functionResponses.push({
                name: call.name!,
                id: call.id!,
                response: result as Record<string, unknown>,
            });
        }

        onStatus?.('thinking');
        response = await withRetry(
            () =>
                chat.sendMessage({
                    message: functionResponses.map((fr) => ({
                        functionResponse: fr,
                    })),
                }),
            onStatus,
        );
        totalUsage = addUsage(totalUsage, extractUsage(response));
    }

    const text = response.text ?? '';
    return { text, usage: totalUsage };
}
