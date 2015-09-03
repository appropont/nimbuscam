//imports
import Ember from 'ember';
import Adapters from '../adapters';

var CameraRoute = Ember.Route.extend({
	setupController: function(controller) {
        if(!controller.adapter) {
            this.transitionTo('repos');
        }
    }
});

export default CameraRoute;