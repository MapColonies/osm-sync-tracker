import { Logger } from '@map-colonies/js-logger';
import { Meter } from '@map-colonies/telemetry';
import { BoundCounter } from '@opentelemetry/api-metrics';
import { RequestHandler } from 'express';
import httpStatus from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { Services } from '../../common/constants';
import { File } from '../models/file';
import { FileManager } from '../models/fileManager';

type PostFileHandler = RequestHandler<{ syncId: string }, string, File>;
type PostFilesHandler = RequestHandler<{ syncId: string }, string, File[]>;

@injectable()
export class FileController {
  public constructor(@inject(Services.LOGGER) private readonly logger: Logger, private readonly manager: FileManager) {}

  public postFile: PostFileHandler = async (req, res, next) => {
    try {
      await this.manager.createFile({ ...req.body, syncId: req.params.syncId });
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      next(error);
    }
  };

  public postFiles: PostFilesHandler = async (req, res, next) => {
    try {
      const syncId = req.params.syncId;
      const bodyWithSyncId = req.body.map((file) => ({ ...file, syncId }));
      await this.manager.createFiles(bodyWithSyncId);
      return res.status(httpStatus.CREATED).send(httpStatus.getStatusText(httpStatus.CREATED));
    } catch (error) {
      next(error);
    }
  };
}