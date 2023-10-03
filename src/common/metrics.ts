import client from 'prom-client';

let entityCounter: client.Counter, fileCounter: client.Counter, syncCounter: client.Counter, changesetCounter: client.Counter;

export function initMetricCounters(registry: client.Registry): void {
  try {
    entityCounter = new client.Counter({
      name: 'entity_count',
      help: 'The overall entity stats',
      labelNames: ['status', 'entityid'] as const,
      registers: [registry],
    });

    fileCounter = new client.Counter({
      name: 'file_count',
      help: 'The overall file stats',
      labelNames: ['status', 'fileid'] as const,
      registers: [registry],
    });

    changesetCounter = new client.Counter({
      name: 'changeset_count',
      help: 'The overall changeset stats',
      labelNames: ['status', 'changesetid'] as const,
      registers: [registry],
    });

    syncCounter = new client.Counter({
      name: 'sync_count',
      help: 'The overall sync stats',
      labelNames: ['status', 'syncid'] as const,
      registers: [registry],
    });
  } catch (error) {
    return;
  }
}

export { entityCounter, fileCounter, syncCounter, changesetCounter };
