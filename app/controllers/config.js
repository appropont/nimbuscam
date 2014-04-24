/*jshint -W098 */

import BaseAdapter from "../adapters/base";

var ConfigController = Ember.ObjectController.extend({
    
    needs: ['camera'],
    
    adapter: BaseAdapter.create(),
    
    //sdk loading
    sdkLoaded: false,    
    sdkLoading: false,    
    sdkLoadFailed: function() {
        if(this.get('sdkLoaded') === true && this.get('sdkLoading') === false) {
            return true;
        } else {
            return false;
        }
    }.property('sdkLoaded', 'sdkLoading'),
    
    configValidated: false,
    
    actions: {
    
        fetchSDK: function() {
        
            var self = this;
            
            self.set('sdkLoading', true);
            
            console.log('self.adapter');
            console.log(self.adapter);
        
            self.adapter.fetchSDK().then(
                function(data) {
                    self.set('sdkLoading', false);
                    self.set('sdkLoaded', true);
                },
                function(error) {
                    self.set('sdkLoading', false);
                    self.set('sdkLoadFailed', true);
                }
            );
        },
    
        validateConfig: function() {
        
            var self = this;
        
            this.adapter.validateConfig().then(
                function(data) {
                    self.set('configValidated', true);
                },
                function(error) {
                    self.set('configValidated', false);
                }
            );
        },
        
        transitionToCamera: function() {
            var cameraController = this.get("controllers.camera");
            cameraController.set("adapter", this.adapter);
                        
            this.transitionToRoute("camera");            
        }
        
    }

});

export default ConfigController;