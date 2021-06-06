import { Logger } from '@map-colonies/js-logger';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { Services } from '../../common/constants';
import { Sync } from '../models/sync';
import { SyncManager } from '../models/syncManager';
import { HttpError } from '../../common/errors';
import { SyncAlreadyExistsError, SyncNotFoundError } from '../models/errors';

type PatchReqBody = Omit<Sync, 'id'>;

type GetLatestSyncHandler = RequestHandler<undefined, Sync, undefined, { layerId: number }>;
type PostSyncHandler = RequestHandler<undefined, string, Sync>;
type PatchSyncHandler = RequestHandler<{ syncId: string }, string, PatchReqBody>;

@injectable()
export class SyncController {
  public constructor(@inject(Services.LOGGER) private readonly logger: Logger, private readonly manager: SyncManager) {}

  public getLatestSync: GetLatestSyncHandler = async (req, res, next) => {
    try {
      const latestSync = await this.manager.getLatestSync(req.query.layerId);
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
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof SyncAlreadyExistsError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      }
      return next(error);
    }
  };

  public patchSync: PatchSyncHandler = async (req, res, next) => {
    try {
      await this.manager.updateSync({ ...req.body, id: req.params.syncId });
      return res.status(httpStatus.OK).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof SyncNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };
}
