import { Logger } from '@map-colonies/js-logger';
import { RequestHandler } from 'express';
import httpStatus, { StatusCodes } from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import mime from 'mime-types';
import { SERVICES } from '../../common/constants';
import { Entity, UpdateEntities, UpdateEntity } from '../models/entity';
import { EntityManager } from '../models/entityManager';
import { HttpError } from '../../common/errors';
import { DuplicateEntityError, EntityAlreadyExistsError, EntityNotFoundError } from '../models/errors';
import { FileNotFoundError } from '../../file/models/errors';
import { ExceededNumberOfRetriesError } from '../../changeset/models/errors';

type PostEntityHandler = RequestHandler<{ fileId: string }, string, Entity>;
type PostEntitiesHandler = RequestHandler<{ fileId: string }, string, Entity[]>;
type PatchEntityHandler = RequestHandler<{ fileId: string; entityId: string }, string[], UpdateEntity>;
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
      await this.manager.createEntities(req.params.fileId, req.body);
      return res.status(httpStatus.CREATED).type(txtplain).send(httpStatus.getStatusText(httpStatus.CREATED));
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
    try {
      const completedSyncIds = await this.manager.updateEntity(req.params.fileId, req.params.entityId, req.body);
      return res.status(httpStatus.OK).json(completedSyncIds);
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        (error as HttpError).status = StatusCodes.NOT_FOUND;
      }
      if (error instanceof ExceededNumberOfRetriesError) {
        const { entityId, fileId } = req.params;
        this.logger.info(`could not update entity ${entityId} from file ${fileId} due to exceeded number of retries`);
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
      if (error instanceof ExceededNumberOfRetriesError) {
        this.logger.info(`could not update entities due to exceeded number of retries`);
      }
      return next(error);
    }
  };
}
