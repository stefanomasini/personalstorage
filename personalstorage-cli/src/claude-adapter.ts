import { spawn, type ChildProcess } from 'node:child_process';
import { emptyUsage, withRetry, type UsageStats, type ToolDeclaration } from './ai-adapter.js';

const MODEL = 'claude-sonnet-4-6';

const activeChildren = new Set<ChildProcess>();

export function killActiveChildren() {
    for (const child of activeChildren) {
        child.kill('SIGTERM');
    }
}

function spawnClaude(args: string[], prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Spawn via 'sh -c "trap \"\" INT; exec claude ..."' so the child
        // ignores SIGINT (inherits SIG_IGN). This prevents Ctrl-C from
        // killing in-flight claude processes while the parent drains.
        const escaped = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ');
        const child = spawn('sh', ['-c', `trap '' INT; claude ${escaped}`], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        activeChildren.add(child);
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
        child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
        child.stdin.end(prompt);
        child.on('close', (code, signal) => {
            activeChildren.delete(child);
            if (signal) {
                reject(new Error(`claude killed by ${signal}`));
                return;
            }
            const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
            const stderr = Buffer.concat(stderrChunks).toString('utf-8');
            if (code !== 0) reject(new Error(`claude exited with code ${code}: ${stderr || stdout}`));
            else resolve(stdout);
        });
        child.on('error', (err) => {
            activeChildren.delete(child);
            reject(err);
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
