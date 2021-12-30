import { Logger } from '@map-colonies/js-logger';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import mime from 'mime-types';
import { SERVICES } from '../../common/constants';
import { Sync, SyncUpdate } from '../models/sync';
import { SyncManager } from '../models/syncManager';
import { HttpError } from '../../common/errors';
import { FullSyncAlreadyExistsError, SyncAlreadyExistsError, SyncNotFoundError } from '../models/errors';
import { GeometryType } from '../../common/enums';

type GetLatestSyncHandler = RequestHandler<undefined, Sync, undefined, { layerId: number; geometryType: GeometryType }>;
type PostSyncHandler = RequestHandler<undefined, string, Sync>;
type PatchSyncHandler = RequestHandler<{ syncId: string }, string, SyncUpdate>;

const txtplain = mime.contentType('text/plain') as string;

@injectable()
export class SyncController {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, private readonly manager: SyncManager) {}

  public getLatestSync: GetLatestSyncHandler = async (req, res, next) => {
    const { layerId, geometryType } = req.query;
    try {
      const latestSync = await this.manager.getLatestSync(layerId, geometryType);
      return res.status(httpStatus.OK).json(latestSync);
    } catch (error) {
      if (error instanceof SyncNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };

  public postSync: PostSyncHandler = async (req, res, next) => {
    try {
      await this.manager.createSync(req.body);
      return res.status(httpStatus.CREATED).type(txtplain).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof SyncAlreadyExistsError || error instanceof FullSyncAlreadyExistsError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      }
      return next(error);
    }
  };

  public patchSync: PatchSyncHandler = async (req, res, next) => {
    try {
      await this.manager.updateSync(req.params.syncId, req.body);
      return res.status(httpStatus.OK).type(txtplain).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof SyncNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };
}
