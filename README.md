# OSM Sync Tracker

----------------------------------

![badge-alerts-lgtm](https://img.shields.io/lgtm/alerts/github/MapColonies/osm-sync-tracker?style=for-the-badge)

![grade-badge-lgtm](https://img.shields.io/lgtm/grade/javascript/github/MapColonies/osm-sync-tracker?style=for-the-badge)

![snyk](https://img.shields.io/snyk/vulnerabilities/github/MapColonies/osm-sync-tracker?style=for-the-badge)

----------------------------------

This is the API for tracking the progress of the osm-sync

Transactions to the database are being called in parallel. while scaling the application horizontally this can produce a race condition on what transaction will be called before the other affecting the integrity of the stored data. thus a [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) in a serializable level is being used on closing files and changesets.
To minimize the number of HTTP calls between the app and the client a Transaction Retry Policy is available. in the case a transaction has failed due to the isolation the transaction will be retried for the number of retries specified.
This can be configured under `application.transactionRetryPolicy`, which has two parameters, an `enabled` flag and `numRetries` the number of retries for a transaction.
The isolation level can be configured under `application.isolationLevel` with one of the following values 'READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ' or 'SERIALIZABLE' defaults to 'SERIALIZABLE'

## Closure
since v4.0.0 a new closure mechanism which relies on [bull-mq](https://www.npmjs.com/package/bullmq) is in use.

The closure is being separated into 3 different jobs - depending on the closure type, a `changeset`, `file` or `sync` closure jobs.
1. `changeset` closure job will produce multiple `file` closure jobs - for all the in-progress `files` whose `entities` are within the `changeset`.
2. `file` closure job will attempt to close the file by validating all its entities are closed, and will produce a single `sync` closure job - the `file`'s `sync` which was closed.
3. `sync` closure job will attempt to close the `sync` by validating all its `files` are closed, it will also close a `rerun` if needed.

Each type has its own queue and configuration as follows:

- `closure.queues.{queueName}.queueOptions.enabledBatchJobs` - are batch jobs enabled, meaning closure jobs with multiple entities
- `closure.queues.{queueName}.queueOptions.maxBatchSize` - the maximum number of entities in a single batch job when batch jobs are enabled
- `closure.queues.{queueName}.jobOptions.attempts` - the maximum number of attempts for each job
- `closure.queues.{queueName}.jobOptions.delay` - the amount of ms a job should be delayed before being processed after creation
- `closure.queues.{queueName}.jobOptions.deduplicationTtl` - the amount of ms upon job creation a job would be detected as deduplicated
- `closure.queues.{queueName}.jobOptions.deduplicationDelay` - the amount of ms a job should be delayed if a job with the same id is being inserted to the queue while the first job was in delayed state
- `closure.queues.{queueName}.jobOptions.backoff.type` - the type of delay between retry attempts, could be either `fixed` or `exponential`
- `closure.queues.{queueName}.jobOptions.backoff.delay` - the amount of ms that will be used in the `backoff.type` to delay a job after a failed attempt
- `closure.queues.${queueName}.workerOptions.concurrency` - the number of jobs that can be processed in parallel
- `closure.queues.${queueName}.workerOptions.limiter.max` - the maximum amount of jobs that can be processed in `limiter.duration` duration window
- `closure.queues.${queueName}.workerOptions.limiter.duration` - the duration window in ms that within it only `limiter.max` jobs can be processed
- `closure.queues.${queueName}.workerOptions.maxStalledCount` - the maximum amount of times an active job can miss its ack to the queue before being failed
- `closure.queues.${queueName}.workerOptions.stalledInterval` - the interval in ms that will demand a job to send an ack to the queue
- `closure.queues.${queueName}.workerOptions.removeOnComplete.age` - automatically remove completed jobs after being completed for this seconds duration
- `closure.queues.${queueName}.workerOptions.removeOnComplete.count` - automatically remove completed jobs if the number of completed jobs exceeds this count
- `closure.queues.${queueName}.workerOptions.removeOnFailed.age` - automatically remove failed jobs after being failed for this seconds duration
- `closure.queues.${queueName}.workerOptions.removeOnFailed.count` - automatically remove failed jobs if the number of failed jobs exceeds this count
- `closure.queues.${queueName}.workerOptions.transactionIsolationLevel` - the transaction isolation level in which the job processing's database actions should be in, default to 'SERIALIZABLE'
- `closure.queues.${queueName}.workerOptions.transactionFailureDelay.minimum/maximum` - the amount of ms between minimum and miximum that will be used to delay a job when it has failed due to transaction failure, these failures will not count as one of the attempts set by `jobOptions.attempts`

## API
Checkout the OpenAPI spec [here](/openapi3.yaml)

## Environment Variables
Please note that `config/custom-environment-variables.json` extends the current common MapColonies TS Server Boilerplate V2 schema. 
You can find the schema [here](https://github.com/MapColonies/schemas/blob/v1.14.0/schemas/common/boilerplate/v2.schema.json).

## Run Locally

Clone the project

```bash

git clone https://github.com/MapColonies/osm-sync-tracker.git

```

Go to the project directory

```bash

cd osm-sync-tracker

```

Install dependencies

```bash

npm install

```

Start the server

```bash

npm start

```

## Running Tests

To run tests, run the following command

```bash

npm run test

```

To only run unit tests:
```bash
npm run test:unit
```

To only run integration tests:
```bash
npm run test:integration
```

Note that the db migrations differ from the auto generated migrations by typeorm thus do not call `synchronize` function, migrate the database before running integration tests
