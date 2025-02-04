import express, { Router } from 'express';
import bodyParser from 'body-parser';
import compression from 'compression';
import { OpenapiViewerRouter } from '@map-colonies/openapi-express-viewer';
import { getErrorHandlerMiddleware } from '@map-colonies/error-express-handler';
import { middleware as OpenApiMiddleware } from 'express-openapi-validator';
import { inject, injectable } from 'tsyringe';
import { Logger } from '@map-colonies/js-logger';
import httpLogger from '@map-colonies/express-access-log-middleware';
import { getTraceContexHeaderMiddleware } from '@map-colonies/telemetry';
import { collectMetricsExpressMiddleware } from '@map-colonies/telemetry/prom-metrics';
import { Registry } from 'prom-client';
import { SERVICES } from './common/constants';
import { FILE_ROUTER_SYMBOL } from './file/routes/fileRouter';
import { SYNC_ROUTER_SYMBOL } from './sync/routes/syncRouter';
import { ENTITY_ROUTER_SYMBOL } from './entity/routes/entityRouter';
import { CHANGESET_ROUTER_SYMBOL } from './changeset/routes/changesetRouter';
import { BullBoard } from './queueProvider/ui/bullBoard';
import { ConfigType } from './common/config';

@injectable()
export class ServerBuilder {
  private readonly serverInstance: express.Application;

  public constructor(
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.METRICS) private readonly metricsRegistry: Registry,
    @inject(FILE_ROUTER_SYMBOL) private readonly fileRouter: Router,
    @inject(SYNC_ROUTER_SYMBOL) private readonly syncRouter: Router,
    @inject(ENTITY_ROUTER_SYMBOL) private readonly entityRouter: Router,
    @inject(CHANGESET_ROUTER_SYMBOL) private readonly changesetRouter: Router,
    private readonly bullBoard: BullBoard
  ) {
    this.serverInstance = express();
  }

  public build(): express.Application {
    this.registerPreRoutesMiddleware();
    this.buildRoutes();
    this.registerPostRoutesMiddleware();

    return this.serverInstance;
  }

  private buildDocsRoutes(): void {
    const openapiConfig = this.config.get('openapiConfig');
    const openapiRouter = new OpenapiViewerRouter({ ...openapiConfig, filePathOrSpec: openapiConfig.filePath });
    openapiRouter.setup();
    this.serverInstance.use(openapiConfig.basePath, openapiRouter.getRouter());
  }

  private buildRoutes(): void {
    this.serverInstance.use('/sync', this.syncRouter);
    this.serverInstance.use('/file', this.fileRouter);
    this.serverInstance.use('/entity', this.entityRouter);
    this.serverInstance.use('/changeset', this.changesetRouter);
    this.buildDocsRoutes();
  }

  private registerPreRoutesMiddleware(): void {
    this.serverInstance.use(collectMetricsExpressMiddleware({ registry: this.metricsRegistry }));
    this.serverInstance.use(httpLogger({ logger: this.logger, ignorePaths: ['/metrics'] }));

    if (this.config.get('server.response.compression.enabled')) {
      this.serverInstance.use(compression(this.config.get('server.response.compression.options') as unknown as compression.CompressionFilter));
    }

    this.serverInstance.use(bodyParser.json(this.config.get('server.request.payload')));
    this.serverInstance.use(getTraceContexHeaderMiddleware());

    /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */ // bull-board types are insufficient
    this.serverInstance.use(this.config.get('closure.uiPath') as string, this.bullBoard.getBullBoardRouter());

    const ignorePathRegex = new RegExp(`^${this.config.get('openapiConfig.basePath')}/.*`, 'i');
    const apiSpecPath = this.config.get('openapiConfig.filePath');
    this.serverInstance.use(OpenApiMiddleware({ apiSpec: apiSpecPath, validateRequests: true, ignorePaths: ignorePathRegex }));
  }

  private registerPostRoutesMiddleware(): void {
    this.serverInstance.use(getErrorHandlerMiddleware());
  }
}
