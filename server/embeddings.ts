import { AzureOpenAI } from 'openai';
import config from '../_private/config.json';

const client = new AzureOpenAI({
  endpoint: config.foundry.endpoint,
  apiKey: config.foundry.key,
  apiVersion: '2024-10-21',
});

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: config.foundry.embeddingModel,
    input: text,
  });
  return response.data[0].embedding;
}
