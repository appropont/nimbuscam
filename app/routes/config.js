//imports
import Ember from 'ember';
import Adapters from '../adapters';

var ConfigRoute = Ember.Route.extend({
    model: function(params) {
        for(var i = 0; i < Adapters.length; i++) {
            if(Adapters[i].slug === params.slug) {
                return Adapters[i];
            }
        }
        this.transitionTo('not-found');        
    },
    setupController: function(controller, model) {
        controller.set('adapter', model.adapter);
        controller.send('fetchSDK');
    },
    serialize: function(model) {
        return { slug: model.get('slug') };
    }
});

export default ConfigRoute;