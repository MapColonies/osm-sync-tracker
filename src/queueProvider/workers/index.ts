import { constructor } from 'tsyringe/dist/typings/types';
import { WorkerEnum } from '../constants';
import { BatchClosureJob, ClosureJob, ClosureReturn } from '../types';
import { ChangesetsWorker } from './changesetsWorker';
import { FilesWorker } from './filesWorker';
import { SyncsWorker } from './syncsWorker';
import { BullWorkerProvider } from './bullWorkerProvider';

export const workerIdToClass = (workerId: WorkerEnum): constructor<BullWorkerProvider<ClosureJob | BatchClosureJob, ClosureReturn>> => {
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
