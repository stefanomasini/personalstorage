import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { FunctionDeclaration, GenerateContentResponse } from '@google/genai';

const MODEL = 'gemini-3-flash-preview';
const INPUT_PRICE_PER_M = 0.5;
const OUTPUT_PRICE_PER_M = 3.0;

export interface UsageStats {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
}

function emptyUsage(): UsageStats {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0, inputCost: 0, outputCost: 0, totalCost: 0 };
}

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

export function addUsage(a: UsageStats, b: UsageStats): UsageStats {
    return {
        inputTokens: a.inputTokens + b.inputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        totalTokens: a.totalTokens + b.totalTokens,
        inputCost: a.inputCost + b.inputCost,
        outputCost: a.outputCost + b.outputCost,
        totalCost: a.totalCost + b.totalCost,
    };
}

export function formatUsage(usage: UsageStats): string {
    return `${usage.inputTokens.toLocaleString()} in + ${usage.outputTokens.toLocaleString()} out — $${usage.totalCost.toFixed(6)}`;
}

function getClient(): GoogleGenAI {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY environment variable is not set. See README.md for setup instructions.');
    }
    return new GoogleGenAI({ apiKey });
}

const RPM = 1000;
const MIN_INTERVAL_MS = 60_000 / RPM;
let lastRequestTime = 0;
let rateLimitLock: Promise<void> = Promise.resolve();

async function rateLimit(onStatus?: (s: string) => void): Promise<void> {
    const prev = rateLimitLock;
    let resolve: () => void;
    rateLimitLock = new Promise((r) => (resolve = r));
    await prev;
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed < MIN_INTERVAL_MS) {
        onStatus?.(`rate limit ${((MIN_INTERVAL_MS - elapsed) / 1000).toFixed(1)}s`);
        await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
    }
    lastRequestTime = Date.now();
    resolve!();
}

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 2_000;

async function withRetry<T>(fn: () => Promise<T>, onStatus?: (s: string) => void): Promise<T> {
    let delay = INITIAL_DELAY_MS;
    for (let attempt = 0; ; attempt++) {
        try {
            await rateLimit(onStatus);
            return await fn();
        } catch (err: any) {
            const status = err?.status ?? err?.error?.code ?? err?.code;
            const retryable = status === 503 || status === 429 || status === 500;
            if (!retryable || attempt >= MAX_RETRIES) throw err;
            const jitter = delay * (0.5 + Math.random());
            onStatus?.(`retry ${attempt + 1}/${MAX_RETRIES} in ${(jitter / 1000).toFixed(1)}s (${status})`);
            await new Promise((r) => setTimeout(r, jitter));
            delay *= 2;
        }
    }
}

const MIME_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
};

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

export interface ToolDeclaration {
    name: string;
    description: string;
    parameters: FunctionDeclaration['parametersJsonSchema'];
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
        parametersJsonSchema: t.parameters,
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
