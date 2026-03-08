export interface UsageStats {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
}

export function emptyUsage(): UsageStats {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0, inputCost: 0, outputCost: 0, totalCost: 0 };
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

export interface ToolDeclaration {
    name: string;
    description: string;
    parameters: unknown;
}

export type AnalyzeDocumentFn = (filePath: string, prompt: string, onStatus?: (s: string) => void) => Promise<{ text: string; usage: UsageStats }>;
export type ChatWithToolsFn = (
    prompt: string,
    tools: ToolDeclaration[],
    executeToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    onStatus?: (s: string) => void,
) => Promise<{ text: string; usage: UsageStats }>;

export const MIME_TYPES: Record<string, string> = {
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

const RPM = 1000;
const MIN_INTERVAL_MS = 60_000 / RPM;
let lastRequestTime = 0;
let rateLimitLock: Promise<void> = Promise.resolve();

export async function rateLimit(onStatus?: (s: string) => void): Promise<void> {
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

export async function withRetry<T>(fn: () => Promise<T>, onStatus?: (s: string) => void): Promise<T> {
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

// Provider switching
let currentProvider: 'gemini' | 'claude' = 'gemini';

export function setProvider(p: 'gemini' | 'claude') {
    currentProvider = p;
}

export function getProvider(): 'gemini' | 'claude' {
    return currentProvider;
}

export async function getAdapter(): Promise<{ analyzeDocument: AnalyzeDocumentFn; chatWithTools: ChatWithToolsFn }> {
    if (currentProvider === 'claude') {
        const claude = await import('./claude-adapter.js');
        return { analyzeDocument: claude.analyzeDocument, chatWithTools: claude.chatWithTools };
    }
    const gemini = await import('./gemini-adapter.js');
    return { analyzeDocument: gemini.analyzeDocument, chatWithTools: gemini.chatWithTools };
}
