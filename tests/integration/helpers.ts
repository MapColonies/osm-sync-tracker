import { setInterval as setIntervalPromise } from 'node:timers/promises';
import jsLogger from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { DataSource } from 'typeorm';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Changeset } from '../../src/changeset/DAL/changeset';
import { SERVICES } from '../../src/common/constants';
import { RegisterOptions } from '../../src/containerConfig';
import { SyncDb } from '../../src/sync/DAL/sync';
import { ClosureJob, ClosureReturn } from '../../src/queueProvider/types';
import { CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, SYNCS_QUEUE_NAME } from '../../src/queueProvider/constants';
import { Identifiable } from '../../src/queueProvider/interfaces';

interface ClosureJobTest {
  data: ClosureJob;
  returnValue?: ClosureReturn;
  err?: unknown;
}

const JOB_CONSUMING_TOKEN = 'token';

const WAIT_FOR_JOB_INTERVAL_MS = 200;

export const BEFORE_ALL_TIMEOUT = 60000;

export const LONG_RUNNING_TEST_TIMEOUT = 30000;

export const RERUN_TEST_TIMEOUT = 60000;

export const DEFAULT_ISOLATION_LEVEL: IsolationLevel = 'SERIALIZABLE';

export const getBaseRegisterOptions = (): Required<RegisterOptions> => {
  return {
    override: [
      { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
      { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
    ],
    useChild: true,
  };
};

export const clearRepositories = async (connection: DataSource): Promise<void> => {
  await connection.transaction(DEFAULT_ISOLATION_LEVEL, async (manager) => {
    await manager.getRepository(SyncDb).delete({});
    await manager.getRepository(Changeset).delete({});
  });
};

export const clearQueues = async (connection: IORedis): Promise<void> => {
  const promises = [CHANGESETS_QUEUE_NAME, FILES_QUEUE_NAME, SYNCS_QUEUE_NAME].map(async (queueName) => {
    const queue = new Queue(queueName, {
      connection,
    });
    await queue.obliterate();
    await queue.close();
  });

  await Promise.all(promises);
};

export async function waitForJobToBeResolved(
  worker: Worker,
  jobId: string,
  preProcessFn?: (job: Job) => void,
  ms: number = WAIT_FOR_JOB_INTERVAL_MS
): Promise<ClosureJobTest | undefined> {
  // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars
  for await (const _unused of setIntervalPromise(ms)) {
    const job = (await worker.getNextJob(JOB_CONSUMING_TOKEN)) as Job<Identifiable> | undefined;

    // no jobs were found
    if (job === undefined) {
      continue;
    }

    // we've fetched another job, move to the next job
    if (job.data.id !== jobId) {
      await job.moveToDelayed(Date.now(), JOB_CONSUMING_TOKEN);
      continue;
    }

    const isDelayed = await job.isDelayed();
    if (isDelayed) {
      continue;
    }

    try {
      if (preProcessFn !== undefined) {
        preProcessFn(job);
      }
      const returnValue = (await worker['processFn'](job)) as ClosureReturn;

      worker.emit('completed', job, undefined, '');
      await job.moveToCompleted(returnValue, JOB_CONSUMING_TOKEN, false);

      return { data: job.data as ClosureJob, returnValue: returnValue };
    } catch (err) {
      const error = err as Error;
      worker.emit('error', error);

      if (job.opts.attempts !== undefined && job.attemptsMade < job.opts.attempts) {
        await job.moveToDelayed(Date.now(), JOB_CONSUMING_TOKEN);
      } else {
        worker.emit('failed', job, error, '');
        await job.moveToFailed(error, JOB_CONSUMING_TOKEN, false);
      }

      return { data: job.data as ClosureJob, err: error };
    }
  }
}
