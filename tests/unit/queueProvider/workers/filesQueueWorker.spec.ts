// import { DelayedError, Job, Worker } from 'bullmq';
// import { DependencyContainer, FactoryFunction } from 'tsyringe';
// import jsLogger from '@map-colonies/js-logger';
// import { SERVICES } from '../../../../src/common/constants';
// import { FILES_QUEUE_NAME, QUEUE_KEY_PREFIX, SYNCS_QUEUE_NAME } from '../../../../src/queueProvider/constants';
// import { FILES_QUEUE_WORKER_NAME, filesQueueWorkerFactory } from '../../../../src/queueProvider/workers/filesQueueWorker';
// import { BatchClosureJob, ClosureJob, ClosureReturn } from '../../../../src/queueProvider/types';
// import { transactionify, TransactionName, TransactionParams } from '../../../../src/common/db/transactions';
// import { TransactionFailureError } from '../../../../src/common/errors';
// import { updateJobCounter, delayJob } from '../../../../src/queueProvider/helpers';
// import { FILE_CUSTOM_REPOSITORY_SYMBOL } from '../../../../src/file/DAL/fileRepository';

// type ProcessFn<T = ClosureJob, R = ClosureReturn> = (job: Job<T, R>) => R;

// jest.mock('bullmq', () => ({
//   // eslint-disable-next-line @typescript-eslint/naming-convention
//   Worker: jest.fn().mockImplementation((_: string, processFn: ProcessFn) => ({
//     processFn,
//     on: jest.fn(),
//     close: jest.fn(),
//   })),
// }));

// jest.mock('../../../../src/queueProvider/helpers', () => ({
//   delayJob: jest.fn(),
//   updateJobCounter: jest.fn(),
// }));

// jest.mock('../../../../src/common/db/transactions', (): object => ({
//   ...jest.requireActual('../../../../src/common/db/transactions'),
//   transactionify: jest.fn().mockImplementation(async (_: TransactionParams, fn: () => Promise<unknown>) => fn()),
// }));

// describe('filesWorker', () => {
//   let factory: FactoryFunction<Worker>;
//   let worker: Worker;

//   const filesWorkerOptionsMock = { b: 2, transactionIsolationLevel: 'b', transactionFailureDelay: { minimum: 20, maximum: 20 } };

//   const configMock = {
//     get: jest.fn((key) => {
//       if (key === `closure.queues.${FILES_QUEUE_NAME}.workerOptions`) {
//         return filesWorkerOptionsMock;
//       }
//     }),
//   };

//   const childLogger = {
//     ...jsLogger({ enabled: false }),
//   };

//   const loggerMock = {
//     child: jest.fn(() => childLogger),
//   };

//   const redisMock = jest.fn();

//   const fileRespositoryMock = {
//     attemptFileClosure: jest.fn(),
//   };

//   const syncsQueueMock = {
//     push: jest.fn(),
//   };

//   const containerMock = {
//     resolve: jest.fn((token) => {
//       if (token === SERVICES.LOGGER) {
//         return loggerMock;
//       }
//       if (token === SERVICES.CONFIG) {
//         return configMock;
//       }
//       if (token === SERVICES.REDIS_WORKER_CONNECTION || token === SERVICES.REDIS_QUEUE_CONNECTION) {
//         return redisMock;
//       }
//       if (token === FILE_CUSTOM_REPOSITORY_SYMBOL) {
//         return fileRespositoryMock;
//       }
//       if (token === SYNCS_QUEUE_NAME) {
//         return syncsQueueMock;
//       }
//       return jest.fn();
//     }),
//   };

//   beforeEach(() => {
//     jest.clearAllMocks();

//     factory = filesQueueWorkerFactory;
//   });

//   it('should create a files worker instance with correct arguments', () => {
//     worker = factory(containerMock as unknown as DependencyContainer);

//     expect(Worker).toHaveBeenCalledTimes(1);
//     expect(Worker).toHaveBeenCalledWith(FILES_QUEUE_NAME, expect.any(Function), {
//       ...filesWorkerOptionsMock,
//       name: FILES_QUEUE_WORKER_NAME,
//       prefix: QUEUE_KEY_PREFIX,
//       connection: redisMock,
//       autorun: false,
//     });
//     expect(worker).toBeDefined();
//   });

//   it('should process a single file closure job with no affected result', async () => {
//     worker = factory(containerMock as unknown as DependencyContainer);
//     const processFn = worker['processFn'];
//     fileRespositoryMock.attemptFileClosure.mockResolvedValue([[], 0]);
//     const job = { data: { id: 'fileId', kind: 'file' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

//     await expect(processFn(job)).resolves.toMatchObject({ closedCount: 0, invokedJobCount: 0, invokedJobs: [] });

//     expect(transactionify).toHaveBeenCalledTimes(1);
//     expect(transactionify).toHaveBeenCalledWith(
//       expect.objectContaining({ transactionName: TransactionName.ATTEMPT_FILE_CLOSURE, isolationLevel: 'b' }),
//       expect.anything(),
//       childLogger
//     );
//     expect(fileRespositoryMock.attemptFileClosure).toHaveBeenCalledTimes(1);
//     expect(fileRespositoryMock.attemptFileClosure).toHaveBeenCalledWith('fileId');
//     expect(syncsQueueMock.push).not.toHaveBeenCalled();
//   });

//   it('should process a single file closure job with affected results', async () => {
//     worker = factory(containerMock as unknown as DependencyContainer);
//     const processFn = worker['processFn'];
//     fileRespositoryMock.attemptFileClosure.mockResolvedValue([[{ fileId: 'fileId', syncId: 'syncId' }], 1]);
//     const job = { data: { id: 'fileId', kind: 'file' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<ClosureJob, ClosureReturn>;

//     await expect(processFn(job)).resolves.toMatchObject({ closedCount: 1, invokedJobCount: 1, invokedJobs: [{ id: 'syncId', kind: 'sync' }] });

//     expect(transactionify).toHaveBeenCalledTimes(1);
//     expect(transactionify).toHaveBeenCalledWith(
//       expect.objectContaining({ transactionName: TransactionName.ATTEMPT_FILE_CLOSURE, isolationLevel: 'b' }),
//       expect.anything(),
//       childLogger
//     );
//     expect(fileRespositoryMock.attemptFileClosure).toHaveBeenCalledTimes(1);
//     expect(fileRespositoryMock.attemptFileClosure).toHaveBeenCalledWith('fileId');
//     expect(syncsQueueMock.push).toHaveBeenCalledTimes(1);
//     expect(syncsQueueMock.push).toHaveBeenCalledWith([{ id: 'syncId', kind: 'sync' }]);
//   });

//   it('should reject if an unknown error occurs', async () => {
//     worker = factory(containerMock as unknown as DependencyContainer);
//     const processFn = worker['processFn'];
//     const someError = new Error('some error');
//     fileRespositoryMock.attemptFileClosure.mockRejectedValue(someError);
//     const job = { data: { id: 'fileId', kind: 'file' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

//     await expect(processFn(job)).rejects.toThrow(someError);

//     expect(transactionify).toHaveBeenCalledTimes(1);
//     expect(transactionify).toHaveBeenCalledWith(
//       expect.objectContaining({ transactionName: TransactionName.ATTEMPT_FILE_CLOSURE, isolationLevel: 'b' }),
//       expect.anything(),
//       childLogger
//     );
//     expect(fileRespositoryMock.attemptFileClosure).toHaveBeenCalledTimes(1);
//     expect(fileRespositoryMock.attemptFileClosure).toHaveBeenCalledWith('fileId');
//     expect(syncsQueueMock.push).not.toHaveBeenCalled();
//     expect(updateJobCounter).not.toHaveBeenCalled();
//     expect(delayJob).not.toHaveBeenCalled();
//   });

//   it('should reject if a transaction failure error occurs and delays the job', async () => {
//     worker = factory(containerMock as unknown as DependencyContainer);
//     const processFn = worker['processFn'];
//     const transactionError = new TransactionFailureError('error');
//     fileRespositoryMock.attemptFileClosure.mockRejectedValue(transactionError);
//     const job = { data: { id: 'fileId', kind: 'file' }, attemptsMade: 0, opts: { attempts: 10 } } as Job<BatchClosureJob, ClosureReturn>;

//     await expect(processFn(job)).rejects.toThrow(DelayedError);

//     expect(transactionify).toHaveBeenCalledTimes(1);
//     expect(transactionify).toHaveBeenCalledWith(
//       expect.objectContaining({ transactionName: TransactionName.ATTEMPT_FILE_CLOSURE, isolationLevel: 'b' }),
//       expect.anything(),
//       childLogger
//     );
//     expect(fileRespositoryMock.attemptFileClosure).toHaveBeenCalledTimes(1);
//     expect(fileRespositoryMock.attemptFileClosure).toHaveBeenCalledWith('fileId');
//     expect(syncsQueueMock.push).not.toHaveBeenCalled();
//     expect(updateJobCounter).toHaveBeenCalledTimes(1);
//     expect(updateJobCounter).toHaveBeenCalledWith(job, 'transactionFailure');
//     expect(delayJob).toHaveBeenCalledTimes(1);
//     expect(delayJob).toHaveBeenCalledWith(job, expect.any(Number));
//   });
// });
