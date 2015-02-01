//imports
import Ember from 'ember';

var ReposController = Ember.ObjectController.extend({
    
    needs: ['config'],
    
    //stub repos
    repos: [
        {name: "Amazon S3"},
        {name: "Dropbox"}
    ],
    
    actions: {
        transitionToConfig: function(adapter) {
            //var configController = this.get("controllers.config");
            //configController.set("adapter", adapter);
            
            this.transitionToRoute("config");     
        }
   }
});

export default ReposController;