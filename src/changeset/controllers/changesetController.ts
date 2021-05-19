import { Logger } from '@map-colonies/js-logger';
import { Meter } from '@map-colonies/telemetry';
import { BoundCounter } from '@opentelemetry/api-metrics';
import { RequestHandler } from 'express';
import httpStatus from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { Services } from '../../common/constants';
import { Changeset, UpdateChangeset } from '../models/changeset';
import { ChangesetManager } from '../models/changesetManager';

type PostChangesetHandler = RequestHandler<undefined, string, Changeset>;
type PatchChangesetHandler = RequestHandler<{ changesetId: string }, string, UpdateChangeset>;
type PutChangesetHandler = RequestHandler<{ changesetId: string }, string, undefined>;

@injectable()
export class ChangesetController {
  public constructor(@inject(Services.LOGGER) private readonly logger: Logger, private readonly manager: ChangesetManager) {}

  public postChangeset: PostChangesetHandler = async (req, res, next) => {
    try {
      await this.manager.createChangeset(req.body);
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      next(error);
    }
  };

  public patchChangeset: PatchChangesetHandler = async (req, res, next) => {
    try {
      await this.manager.updateChangeset(req.params.changesetId, req.body);
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      next(error);
    }
  };

  public putChangeset: PutChangesetHandler = async (req, res, next) => {
    try {
      await this.manager.closeChangeset(req.params.changesetId);
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      next(error);
    }
  };
}
