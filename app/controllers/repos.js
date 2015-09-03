//imports
import Ember from 'ember';

var ReposController = Ember.ObjectController.extend({
    
    needs: ['config'],
    
    //stub repos
    repos: [
        {name: "Amazon S3"},
        {name: "Dropbox"}
    ]

});

export default ReposController;