import { Pinecone, type RecordMetadata } from '@pinecone-database/pinecone';

const INDEX_NAME = 'personalstorage';

let client: Pinecone | undefined;

function getIndex() {
    if (!client) {
        client = new Pinecone();
    }
    return client.index(INDEX_NAME);
}

export interface VectorMetadata {
    dropbox_path: string;
    name: string;
    description: string;
    min_date?: number;
    max_date?: number;
    all_dates?: string;
}

export async function upsertVector(id: string, values: number[], metadata: VectorMetadata): Promise<void> {
    const record: RecordMetadata = { ...metadata };
    await getIndex().upsert([{ id, values, metadata: record }]);
}

export async function deleteVector(id: string): Promise<void> {
    await getIndex().deleteOne(id);
}

