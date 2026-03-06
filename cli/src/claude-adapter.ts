import { spawn } from 'node:child_process';

interface AskClaudeOptions {
    allowedTools: string[];
}

export async function askClaude(prompt: string, options: AskClaudeOptions): Promise<string> {
    const tools = options.allowedTools;

    const args = ['-p', '--allowedTools', ...tools, '--output-format', 'json', prompt];

    const raw = await new Promise<string>((resolve, reject) => {
        const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const chunks: Buffer[] = [];
        child.stdout.on('data', (chunk) => chunks.push(chunk));
        child.on('close', (code) => {
            const output = Buffer.concat(chunks).toString('utf-8');
            if (code !== 0) reject(new Error(`claude exited with code ${code}: ${output}`));
            else resolve(output);
        });
        child.on('error', reject);
    });

    const response = JSON.parse(raw);
    return response.result;
}
