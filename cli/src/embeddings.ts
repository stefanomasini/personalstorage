import OpenAI from 'openai';

let client: OpenAI | undefined;

function getClient(): OpenAI {
    if (!client) {
        client = new OpenAI();
    }
    return client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await getClient().embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    });
    return response.data[0].embedding;
}
