# OSM Sync Tracker

----------------------------------

![badge-alerts-lgtm](https://img.shields.io/lgtm/alerts/github/MapColonies/osm-sync-tracker?style=for-the-badge)

![grade-badge-lgtm](https://img.shields.io/lgtm/grade/javascript/github/MapColonies/osm-sync-tracker?style=for-the-badge)

![snyk](https://img.shields.io/snyk/vulnerabilities/github/MapColonies/osm-sync-tracker?style=for-the-badge)

----------------------------------

This is the API for tracking the progress of the osm-sync

Transactions to the database are being called in parallel. while scaling the application horizontally this can produce a race condition on what transaction will be called before the other affecting the integrity of the stored data. thus a [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) in a serializable level is being used on closing a file and a changeset.
To minimize the number of HTTP calls between the app and the client a Transaction Retry Policy is available. in the case a transaction has failed due to the isolation the transaction will be retried for the number of retries specified.
This can be configured under `application.transactionRetryPolicy`, which has two parameters, an `enabled` flag and `numRetries` the number of retries for a transaction.
The isolation level can be configured under `application.isolationLevel` with one of the following values 'READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ' or 'SERIALIZABLE' defaults to 'SERIALIZABLE'

## API
Checkout the OpenAPI spec [here](/openapi3.yaml)

### Install Git Hooks
```bash
npx husky install
```

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
