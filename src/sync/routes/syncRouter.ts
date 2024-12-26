import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { FileController } from '../../file/controllers/fileController';
import { SyncController } from '../controllers/syncController';

export const syncRouterSymbol = Symbol('syncRouterFactory');

export const syncRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const syncController = dependencyContainer.resolve(SyncController);
  const fileController = dependencyContainer.resolve(FileController);

  router.get('/', syncController.getSyncs);
  router.post('/', syncController.postSync);
  router.get('/latest', syncController.getLatestSync);
  router.post('/closure', syncController.postSyncsClosure);
  router.patch('/:syncId', syncController.patchSync);

  router.post('/:syncId/file', fileController.postFile);
  router.post('/:syncId/file/_bulk', fileController.postFiles);
  router.patch('/:syncId/file/:fileId', fileController.patchFile);
  router.post('/:syncId/rerun', syncController.rerunSync);

  return router;
};
