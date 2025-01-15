import { Logger } from '@map-colonies/js-logger';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import mime from 'mime-types';
import { SERVICES } from '../../common/constants';
import { Entity, UpdateEntities, UpdateEntity } from '../models/entity';
import { EntityBulkCreationResult, EntityManager } from '../models/entityManager';
import { HttpError } from '../../common/errors';
import { DuplicateEntityError, EntityAlreadyExistsError, EntityNotFoundError } from '../models/errors';
import { FileNotFoundError } from '../../file/models/errors';

type PostEntityHandler = RequestHandler<{ fileId: string }, string, Entity>;
type PostEntitiesHandler = RequestHandler<{ fileId: string }, EntityBulkCreationResult, Entity[]>;
type PatchEntityHandler = RequestHandler<{ fileId: string; entityId: string }, string, UpdateEntity>;
type PatchEntitiesHandler = RequestHandler<undefined, string, UpdateEntities>;

const txtplain = mime.contentType('text/plain') as string;

@injectable()
export class EntityController {
  public constructor(@inject(SERVICES.LOGGER) private readonly logger: Logger, private readonly manager: EntityManager) {}

  public postEntity: PostEntityHandler = async (req, res, next) => {
    try {
      await this.manager.createEntity(req.params.fileId, req.body);
      return res.status(httpStatus.CREATED).type(txtplain).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      } else if (error instanceof FileNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };

  public postEntities: PostEntitiesHandler = async (req, res, next) => {
    try {
      const result = await this.manager.createEntities(req.params.fileId, req.body);
      return res.status(httpStatus.CREATED).json(result);
    } catch (error) {
      if (error instanceof EntityAlreadyExistsError || error instanceof DuplicateEntityError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      } else if (error instanceof FileNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };

  public patchEntity: PatchEntityHandler = async (req, res, next) => {
    const { fileId, entityId } = req.params;
    try {
      await this.manager.updateEntity(fileId, entityId, req.body);
      return res.status(httpStatus.OK).type(txtplain).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };

  public patchEntities: PatchEntitiesHandler = async (req, res, next) => {
    try {
      await this.manager.updateEntities(req.body);
      return res.status(httpStatus.OK).type(txtplain).send(httpStatus.getStatusText(httpStatus.OK));
    } catch (error) {
      if (error instanceof DuplicateEntityError) {
        (error as HttpError).status = StatusCodes.CONFLICT;
      } else if (error instanceof EntityNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      return next(error);
    }
  };
}
