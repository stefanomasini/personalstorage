import { Command } from 'commander';
import { auth } from './commands/auth.js';
import { initTemplate } from './commands/init.js';
import { setMetadata } from './commands/set.js';
import { getMetadata } from './commands/get.js';
import { listMetadata } from './commands/list.js';
import { checkMetadata } from './commands/check.js';
import { startLiveServer } from './commands/live.js';
import { analyze } from './commands/analyze.js';
import { startMcpServer } from './commands/mcp.js';
import { decideLocation } from './commands/decide-location.js';

function normalizePath(p: string): string {
    const segments = p.split('/');
    const idx = segments.indexOf('Dropbox');
    if (idx !== -1) {
        const relative = segments.slice(idx + 1).join('/');
        p = relative ? '/' + relative : '';
    }
    return p === '/' ? '' : p;
}

const program = new Command();

program.name('storage-cli').description('Manage custom metadata on Dropbox folders/files').version('0.1.0');

program
    .command('auth')
    .description('Authorize with Dropbox and obtain a refresh token')
    .action(async () => {
        await auth();
    });

program
    .command('init')
    .description('Create the property template (one-time setup)')
    .action(async () => {
        await initTemplate();
    });

program
    .command('set <path>')
    .description('Set metadata on a Dropbox path')
    .option('--usage <string>', 'Storage usage description')
    .option('--ignore', 'Mark path as ignored in storage reports')
    .option('--no-ignore', 'Unmark path as ignored')
    .option('--leaf', 'Mark folder as a leaf node')
    .option('--no-leaf', 'Unmark folder as leaf')
    .option('--template <args...>', 'Add a template entry (name subfolder usage)')
    .option('--remove-template <name>', 'Remove an entire template')
    .option('--remove-template-entry <args...>', 'Remove a subfolder from a template (name subfolder)')
    .option('--apply-template <name>', 'Apply a template from the parent folder')
    .option('--no-apply-template', 'Remove the applied template')
    .action(
        async (
            filePath: string,
            options: {
                usage?: string;
                ignore?: boolean;
                leaf?: boolean;
                template?: string[];
                removeTemplate?: string;
                removeTemplateEntry?: string[];
                applyTemplate?: string | boolean;
            },
        ) => {
            await setMetadata(normalizePath(filePath), options);
        },
    );

program
    .command('get <path>')
    .description('Get metadata for a Dropbox path')
    .action(async (filePath: string) => {
        await getMetadata(normalizePath(filePath));
    });

program
    .command('list <path>')
    .description('List child folders and their usage')
    .option('--markdown', 'Force markdown output (default when not a TTY)')
    .action(async (folderPath: string, options: { markdown?: boolean }) => {
        await listMetadata(normalizePath(folderPath), options);
    });

program
    .command('check')
    .description('Find terminal folders not marked as leaf')
    .option('--markdown', 'Force markdown output (default when not a TTY)')
    .option('--verbose', 'Print each API call to stderr')
    .action(async (options: { markdown?: boolean; verbose?: boolean }) => {
        await checkMetadata(options);
    });

program
    .command('live')
    .description('Start a web UI for browsing and editing metadata')
    .option('--port <number>', 'Port to listen on', '3141')
    .action(async (options: { port: string }) => {
        await startLiveServer(parseInt(options.port, 10));
    });

program
    .command('analyze <local-path>')
    .description('Analyze a local file or directory and store document metadata')
    .option('--force', 'Re-analyze files that already have metadata')
    .option('--concurrency <number>', 'Number of files to analyze in parallel', '5')
    .option('--no-decide-location', 'Skip running decide-location after analysis')
    .option('--limit <number>', 'Maximum number of files to process')
    .action(async (localPath: string, options: { force?: boolean; concurrency: string; decideLocation: boolean; limit?: string }) => {
        await analyze(localPath, {
            force: !!options.force,
            concurrency: parseInt(options.concurrency, 10),
            decideLocation: options.decideLocation,
            limit: options.limit ? parseInt(options.limit, 10) : undefined,
        });
    });

program
    .command('decide-location <local-path>')
    .description('Decide destination location for analyzed files')
    .option('--force', 'Re-decide files that already have a location')
    .option('--concurrency <number>', 'Number of files to process in parallel', '5')
    .option('--limit <number>', 'Maximum number of files to process')
    .action(async (localPath: string, options: { force?: boolean; concurrency: string; limit?: string }) => {
        await decideLocation(localPath, {
            force: !!options.force,
            concurrency: parseInt(options.concurrency, 10),
            limit: options.limit ? parseInt(options.limit, 10) : undefined,
        });
    });

program
    .command('mcp')
    .description('Start an MCP server over stdio')
    .action(async () => {
        await startMcpServer();
    });

program.parseAsync().catch((err) => {
    if (err?.status && err?.error) {
        const summary = err.error?.error_summary ?? 'unknown error';
        console.error(`\x1b[1;31mDropbox API error:\x1b[0m ${summary}`);
        process.exit(1);
    }
    console.error(`\x1b[1;31mError:\x1b[0m ${err.message ?? err}`);
    process.exit(1);
});
