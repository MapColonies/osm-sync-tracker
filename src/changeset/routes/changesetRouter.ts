import { Router } from 'express';
import { FactoryFunction } from 'tsyringe';
import { ChangesetController } from '../controllers/changesetController';

const changesetRouterFactory: FactoryFunction<Router> = (dependencyContainer) => {
  const router = Router();
  const controller = dependencyContainer.resolve(ChangesetController);

  router.post('changeset', controller.postChangeset);
  router.patch('changeset/:changesetId', controller.updateChangeset);
  //router.put('changeset/changesetId/close', controller.patchChangeset);

  return router;
};

export default changesetRouterFactory;
