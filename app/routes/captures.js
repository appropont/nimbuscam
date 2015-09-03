//imports
import Ember from 'ember';

var CapturesRoute = Ember.Route.extend({
    setupController: function(controller) {
        var adapter = controller.get('adapter');
        if(!adapter) {
            this.transitionTo('repos');
        }
        console.log('adapter in capturesRoute setupController: ', adapter)
        if(adapter && typeof adapter.getUploadedImages === 'function') {
            adapter.getUploadedImages().then(function(captures) {
                console.log('captures: ', captures);
                controller.set('captures', captures);
            });
        } else {
            console.log('getUploadImages not defined');
        }
    }
});

export default CapturesRoute;