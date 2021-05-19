import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { SyncController } from '../controllers/syncController';

const syncRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(SyncController);

  router.post('/', controller.postSync);
  router.get('/latest', controller.getLatestSync);
  router.patch('/:syncId', controller.patchSync);

  return router;
};

export { syncRouterFactory };
