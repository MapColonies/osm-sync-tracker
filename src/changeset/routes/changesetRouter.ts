import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { ChangesetController } from '../controllers/changesetController';

const changesetRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(ChangesetController);

  router.post('', controller.postChangeset);
  router.patch('/:changesetId', controller.patchChangeset);
  router.put('/:changesetId/close', controller.putChangeset);

  return router;
};

export default changesetRouterFactory;
