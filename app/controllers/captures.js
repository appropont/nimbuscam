//imports
import Ember from 'ember';

var CapturesController = Ember.ObjectController.extend({

    adapter: null,
    captures: [],

    /*********************************************
     *
     *  Computed Properties
     *
     *********************************************/
    
    noAdapter: function() {
    
        var adapter = this.get('adapter');
    
        if(adapter === null) {
            return true;
        } else {
            return false;
        }
    }.property('adapter'),

    /*********************************************
     *
     *  Actions
     *
     *********************************************/
    actions: {
        toggleFullSizeImage: function(capture) {
            console.log('showFullSizeImage fired');
            //capture.set('isSelected', true);
            capture.toggleProperty('isSelected');
        }
    }

    

});

export default CapturesController;
