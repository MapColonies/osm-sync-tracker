// Because this file is a module it should imported using the `--import` flag in the `node` command, and should not be imported by any other file.
import { tracingFactory } from './common/tracing.js';
import { getConfig, initConfig } from './common/config.js';

await initConfig(true);

const config = getConfig();

const tracingConfig = config.get('telemetry.tracing');
const sharedConfig = config.get('telemetry.shared');

const tracing = tracingFactory({ ...tracingConfig, ...sharedConfig });

tracing.start();
