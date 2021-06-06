import { Logger } from '@map-colonies/js-logger';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { Services } from '../../common/constants';
import { Changeset, UpdateChangeset } from '../models/changeset';
import { ChangesetManager } from '../models/changesetManager';
import { HttpError } from '../../common/errors';
import { ChangesetAlreadyExistsError, ChangesetNotFoundError } from '../models/errors';
import { IConfig } from '../../common/interfaces';

type PostChangesetHandler = RequestHandler<undefined, string, Changeset>;
type PatchChangesetHandler = RequestHandler<{ changesetId: string }, string, UpdateChangeset>;
type PutChangesetHandler = RequestHandler<{ changesetId: string }, string, undefined>;

@injectable()
export class ChangesetController {
  public constructor(
    @inject(Services.LOGGER) private readonly logger: Logger,
    @inject(Services.CONFIG) private readonly config: IConfig,
    private readonly manager: ChangesetManager
  ) {}

  public postChangeset: PostChangesetHandler = async (req, res, next) => {
    try {
      await this.manager.createChangeset(req.body);
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
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
      return res.status(httpStatus.OK).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof ChangesetNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };

  public putChangeset: PutChangesetHandler = async (req, res, next) => {
    try {
      await this.manager.closeChangeset(req.params.changesetId, this.config.get('db.schema'));
      return res.status(httpStatus.OK).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof ChangesetNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };
}
