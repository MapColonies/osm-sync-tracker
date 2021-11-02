import { Logger } from '@map-colonies/js-logger';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import mime from 'mime-types';
import { Services } from '../../common/constants';
import { Changeset, UpdateChangeset } from '../models/changeset';
import { ChangesetManager } from '../models/changesetManager';
import { HttpError } from '../../common/errors';
import { ChangesetAlreadyExistsError, ChangesetNotFoundError, ExceededNumberOfRetriesError } from '../models/errors';

type PostChangesetHandler = RequestHandler<undefined, string, Changeset>;
type PatchChangesetHandler = RequestHandler<{ changesetId: string }, string, UpdateChangeset>;
type PutChangesetHandler = RequestHandler<{ changesetId: string }, string, undefined>;
type PatchChangesetEntitiesHandler = RequestHandler<{ changesetId: string }, string, undefined>;
type PutChangesetsHandler = RequestHandler<undefined, string[], string[]>;

const txtplain = mime.contentType('text/plain') as string;

@injectable()
export class ChangesetController {
  public constructor(@inject(Services.LOGGER) private readonly logger: Logger, private readonly manager: ChangesetManager) {}

  public postChangeset: PostChangesetHandler = async (req, res, next) => {
    try {
      await this.manager.createChangeset(req.body);
      return res.status(httpStatus.CREATED).type(txtplain).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof ChangesetAlreadyExistsError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      }
      return next(error);
    }
  };

  public patchChangeset: PatchChangesetHandler = async (req, res, next) => {
    try {
      await this.manager.updateChangeset(req.params.changesetId, req.body);
      return res.status(httpStatus.OK).type(txtplain).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof ChangesetNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };

  public putChangeset: PutChangesetHandler = async (req, res, next) => {
    try {
      await this.manager.closeChangeset(req.params.changesetId);
      return res.status(httpStatus.OK).type(txtplain).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof ChangesetNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      if (error instanceof ExceededNumberOfRetriesError) {
        this.logger.info(`could not close changeset ${req.params.changesetId} number of retries exceeded`);
      }
      return next(error);
    }
  };

  public patchChangesetEntities: PatchChangesetEntitiesHandler = async (req, res, next) => {
    try {
      await this.manager.updateChangesetEntities(req.params.changesetId);
      return res.status(httpStatus.OK).type(txtplain).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof ChangesetNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };

  public putChangesets: PutChangesetsHandler = async (req, res, next) => {
    try {
      const completedSyncIds = await this.manager.closeChangesets(req.body);
      return res.status(httpStatus.OK).json(completedSyncIds);
    } catch (error) {
      if (error instanceof ExceededNumberOfRetriesError) {
        this.logger.info(`could not close changesets number of retries exceeded`);
      }
      return next(error);
    }
  };
}
