import Adapters from '../adapters';

var ReposRoute = Ember.Route.extend({
    setupController: function (controller) {
        controller.set('repos', Adapters);
    }
});

export default ReposRoute;