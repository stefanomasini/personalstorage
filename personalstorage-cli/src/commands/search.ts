import { generateEmbedding } from '../embeddings.js';
import { queryVectors } from '../vector-store.js';
import { parseDateToEpoch } from '../dates.js';

const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export async function search(
    query: string,
    options: { from?: string; to?: string; limit: number },
): Promise<void> {
    const values = await generateEmbedding(query);

    const filter: Record<string, any> = {};
    if (options.from) {
        const start = parseDateToEpoch(options.from, 'min');
        if (isNaN(start)) {
            console.error(`Invalid --from date: ${options.from}`);
            process.exit(1);
        }
        filter.max_date = { $gte: start };
    }
    if (options.to) {
        const end = parseDateToEpoch(options.to, 'max');
        if (isNaN(end)) {
            console.error(`Invalid --to date: ${options.to}`);
            process.exit(1);
        }
        filter.min_date = { $lte: end };
    }

    const results = await queryVectors(
        values,
        options.limit,
        Object.keys(filter).length > 0 ? filter : undefined,
    );

    if (results.length === 0) {
        console.log('No results found.');
        return;
    }

    for (const r of results) {
        const { dropbox_path, name, description } = r.metadata;
        console.log(`  ${CYAN}${dropbox_path}${RESET}  ${DIM}(${r.score.toFixed(2)})${RESET}`);
        console.log(`  ${name}`);
        if (description) console.log(`  ${DIM}${description}${RESET}`);
        console.log();
    }
}
