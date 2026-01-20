import { constructor } from 'tsyringe/dist/typings/types';
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

export { ChangesetsWorker, FilesWorker, SyncsWorker };
