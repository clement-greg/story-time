import { CosmosClient, Database, Container } from '@azure/cosmos';
import config from '../_private/config.json';

const client = new CosmosClient({
  endpoint: config.cosmosEndpoint,
  key: config.cosmosKey,
});

const database: Database = client.database(config.cosmosDatabase);

const containerDefs = [
  { id: 'series', partitionKey: { paths: ['/id'] } },
  { id: 'books', partitionKey: { paths: ['/id'] } },
  { id: 'entities', partitionKey: { paths: ['/id'] } },
  { id: 'chapters', partitionKey: { paths: ['/id'] } },
  { id: 'something-else', partitionKey: { paths: ['/id'] } },
];

export function getContainer(containerName: string): Container {
  return database.container(containerName);
}

export async function initDatabase(): Promise<void> {
  await client.databases.createIfNotExists({
    id: config.cosmosDatabase,
    throughput: 1000,
  });

  // Try creating all containers
  try {
    for (const def of containerDefs) {
      await database.containers.createIfNotExists(def);
    }
    return;
  } catch (err: any) {
    if (err.code !== 400 || err.substatus !== 1028) throw err;
  }

  // Throughput limit hit — migrate to shared database throughput
  console.log('Migrating database to shared throughput...');

  const backup: Record<string, any[]> = {};
  for (const def of containerDefs) {
    try {
      const { resources } = await database
        .container(def.id)
        .items.query('SELECT * FROM c')
        .fetchAll();
      backup[def.id] = resources;
    } catch {
      backup[def.id] = [];
    }
  }

  await database.delete();
  await client.databases.create({
    id: config.cosmosDatabase,
    throughput: 1000,
  });

  for (const def of containerDefs) {
    await database.containers.createIfNotExists(def);
    for (const item of backup[def.id]) {
      const { _rid, _self, _etag, _attachments, _ts, ...cleanItem } = item;
      await database.container(def.id).items.create(cleanItem);
    }
  }

  console.log('Database migration complete.');
}
