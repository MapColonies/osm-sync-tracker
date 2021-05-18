import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { FileController } from '../controllers/fileController';

const fileRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(FileController);

  router.post('/sync/:syncId/file', controller.postFile);
  router.post('/sync/:syncId/_bulk', controller.postFiles);

  return router;
};

export default fileRouterFactory;
