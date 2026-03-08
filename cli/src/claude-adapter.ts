import { spawn } from 'node:child_process';
import { emptyUsage, withRetry, type UsageStats, type ToolDeclaration } from './ai-adapter.js';

const MODEL = 'claude-sonnet-4-6';

function spawnClaude(args: string[], prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
        child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
        child.stdin.end(prompt);
        child.on('close', (code) => {
            const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
            const stderr = Buffer.concat(stderrChunks).toString('utf-8');
            if (code !== 0) reject(new Error(`claude exited with code ${code}: ${stderr || stdout}`));
            else resolve(stdout);
        });
        child.on('error', reject);

        const cleanup = () => {
            child.kill('SIGTERM');
        };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        child.on('close', () => {
            process.removeListener('SIGINT', cleanup);
            process.removeListener('SIGTERM', cleanup);
        });
    });
}

function parseClaudeResponse(raw: string): string {
    const response = JSON.parse(raw);
    return response.result;
}

export async function analyzeDocument(
    filePath: string,
    prompt: string,
    onStatus?: (s: string) => void,
): Promise<{ text: string; usage: UsageStats }> {
    const fullPrompt = `${prompt}\n\nRead and analyze the file at: ${filePath}`;

    const text = await withRetry(async () => {
        onStatus?.('claude');
        const raw = await spawnClaude([
            '-p', '--model', MODEL,
            '--output-format', 'json',
            '--allowedTools', 'Read',
        ], fullPrompt);
        return parseClaudeResponse(raw);
    }, onStatus);

    return { text, usage: emptyUsage() };
}

export async function chatWithTools(
    prompt: string,
    _tools: ToolDeclaration[],
    _executeToolCall: (name: string, args: Record<string, unknown>) => Promise<unknown>,
    onStatus?: (s: string) => void,
): Promise<{ text: string; usage: UsageStats }> {
    const text = await withRetry(async () => {
        onStatus?.('claude');
        const raw = await spawnClaude([
            '-p', '--model', MODEL,
            '--output-format', 'json',
            '--allowedTools', 'mcp__personalstorage__list',
        ], prompt);
        return parseClaudeResponse(raw);
    }, onStatus);

    return { text, usage: emptyUsage() };
}
