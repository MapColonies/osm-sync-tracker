import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { FileController } from '../../file/controllers/fileController';
import { SyncController } from '../controllers/syncController';

export const syncRouterSymbol = Symbol('syncRouterFactory');

export const syncRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const syncController = dependencyContainer.resolve(SyncController);
  const controller = dependencyContainer.resolve(FileController);

  router.post('/', syncController.postSync);
  router.get('/latest', syncController.getLatestSync);
  router.patch('/:syncId', syncController.patchSync);

  router.post('/:syncId/file', controller.postFile);
  router.post('/:syncId/file/_bulk', controller.postFiles);

  return router;
};
