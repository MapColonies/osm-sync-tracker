import { Logger } from '@map-colonies/js-logger';
import { Meter } from '@map-colonies/telemetry';
import { BoundCounter } from '@opentelemetry/api-metrics';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { Services } from '../../common/constants';
import { Entity, UpdateEntity } from '../models/entity';
import { EntityManager } from '../models/entityManager';
import { HttpError } from '../../common/errors';
import { EntityAlreadyExistsError, EntityNotFoundError } from '../models/errors';

type PostEntityHandler = RequestHandler<{ fileId: string }, string, Entity>;
type PostEntitiesHandler = RequestHandler<{ fileId: string }, string, Entity[]>;
type PatchEntityHandler = RequestHandler<{ fileId: string; entityId: string }, string, UpdateEntity>;

@injectable()
export class EntityController {
  public constructor(@inject(Services.LOGGER) private readonly logger: Logger, private readonly manager: EntityManager) {}

  public postEntity: PostEntityHandler = async (req, res, next) => {
    try {
      await this.manager.createEntity({ ...req.body, fileId: req.params.fileId });
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      }
      next(error);
    }
  };

  public postEntities: PostEntitiesHandler = async (req, res, next) => {
    try {
      const fileId = req.params.fileId;
      const bodyWithFileId = req.body.map((entity) => ({ ...entity, fileId }));
      await this.manager.createEntities(bodyWithFileId);
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      }
      next(error);
    }
  };

  public patchEntity: PatchEntityHandler = async (req, res, next) => {
    try {
      await this.manager.updateEntity(req.params.fileId, req.params.entityId, req.body);
      return res.status(httpStatus.OK).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      next(error);
    }
  };
}
