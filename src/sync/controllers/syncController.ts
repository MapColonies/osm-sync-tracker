import { Logger } from '@map-colonies/js-logger';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { SnakeCasedProperties } from 'type-fest';
import mime from 'mime-types';
import { SERVICES } from '../../common/constants';
import { BaseSync, Sync, SyncsFilter, SyncUpdate } from '../models/sync';
import { SyncManager } from '../models/syncManager';
import { HttpError } from '../../common/errors';
import {
  FullSyncAlreadyExistsError,
  InvalidSyncForRerunError,
  RerunAlreadyExistsError,
  SyncAlreadyExistsError,
  SyncNotFoundError,
} from '../models/errors';
import { GeometryType } from '../../common/enums';
import { convertObjectToCased } from '../../common/utils';

type GetSyncsHandler = RequestHandler<undefined, BaseSync[], undefined, SnakeCasedProperties<SyncsFilter>>;
type GetLatestSyncHandler = RequestHandler<undefined, BaseSync, undefined, { layerId: number; geometryType: GeometryType }>;
type PostSyncHandler = RequestHandler<undefined, string, Sync>;
type PatchSyncHandler = RequestHandler<{ syncId: string }, string, SyncUpdate>;
type PostSyncsClosureHandler = RequestHandler<undefined, string, string[]>;
type RerunSyncHandler = RequestHandler<{ syncId: string }, string, { rerunId: string; startDate: Date; shouldRerunNotSynced?: boolean }>;

const txtplain = mime.contentType('text/plain') as string;

@injectable()
export class SyncController {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    private readonly manager: SyncManager
  ) {}

  public getSyncs: GetSyncsHandler = async (req, res, next) => {
    try {
      const filter = convertObjectToCased(req.query as Record<string, unknown>, 'camel');
      const syncs = await this.manager.getSyncs(filter);
      return res.status(httpStatus.OK).json(syncs);
    } catch (error) {
      return next(error);
    }
  };

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

  public postSyncsClosure: PostSyncsClosureHandler = async (req, res, next) => {
    const syncIds = req.body;
    try {
      await this.manager.createClosures(syncIds);
      return res.status(httpStatus.CREATED).type(txtplain).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      return next(error);
    }
  };

  public rerunSync: RerunSyncHandler = async (req, res, next) => {
    const { rerunId, startDate, shouldRerunNotSynced } = req.body;
    try {
      const wasRerunCreated = await this.manager.rerunSyncIfNeeded(req.params.syncId, rerunId, startDate, shouldRerunNotSynced);
      if (wasRerunCreated) {
        return res.status(httpStatus.CREATED).type(txtplain).send(httpStatus.getStatusText(httpStatus.CREATED));
      }
      return res.status(httpStatus.OK).type(txtplain).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof SyncNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      if (error instanceof RerunAlreadyExistsError || error instanceof InvalidSyncForRerunError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      }
      return next(error);
    }
  };
}
