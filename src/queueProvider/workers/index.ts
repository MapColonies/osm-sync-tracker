import { Worker } from 'bullmq';
import { constructor, DependencyContainer } from 'tsyringe/dist/typings/types';
import { CleanupRegistry } from '@map-colonies/cleanup-registry';
import { SERVICES } from '@src/common/constants';
import { WorkerEnum } from '../constants';
import { ChangesetsWorker } from './changesetsWorker';
import { FilesWorker } from './filesWorker';
import { SyncsWorker } from './syncsWorker';

export const workerIdToClass = (workerId: WorkerEnum): constructor<unknown> => {
  switch (workerId) {
    case WorkerEnum.CHANGESETS:
      return ChangesetsWorker;
    case WorkerEnum.FILES:
      return FilesWorker;
    case WorkerEnum.SYNCS:
      return SyncsWorker;
  }
};

export const bullWorkerPostInjectionHookFactory = (symbol: symbol | string): ((container: DependencyContainer) => void) => {
  const postInjectionHookFn = (container: DependencyContainer): void => {
    const worker = container.resolve<Worker>(symbol);
    const cleanupRegistry = container.resolve<CleanupRegistry>(SERVICES.CLEANUP_REGISTRY);
    cleanupRegistry.register({ id: symbol, func: worker.close.bind(worker) });
  };

  return postInjectionHookFn;
};

export { ChangesetsWorker, FilesWorker, SyncsWorker };
