import Adapters from '../adapters';

var ConfigRoute = Ember.Route.extend({
    model: function(params) {
        for(var i = 0; i < Adapters.length; i++) {
            if(Adapters[i].slug === params.slug) {
                console.log('matched adapter slug');
                return Adapters[i];
            }
        }
        return null;
    },
    setupController: function(controller, model) {
        console.log('controller.adapter');
        controller.set('adapter', model.adapter);
        console.log(controller.adapter);
        //controller.set('adapter', controller.model.get('adapter'));
        controller.send("fetchSDK");
    },
    serialize: function(model) {
        return { slug: model.get('slug') };
    }
});

export default ConfigRoute;