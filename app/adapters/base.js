//This is essentially a skeleton for other developers to use as a base for their custom adapters.

/*jshint -W098 */


//I am strongly considering making this extend Model instead of Object
var BaseAdapter = Ember.Object.extend({

    //Properties that should be overridden
    name: "Base Adapter",
    logoURL: "",
    
    config: {
    
    },
    configTemplate: "adapters/baseconfig",
    
    fetchSDK: function() {
        //returns true since no SDK needs fetching (maybe false would be better?)
        return true;
    },
    
    validateConfig: function(config, callback) {
        throw new Error(Ember.String.fmt("%@ has to implement testConfig() method which is required to verify the user's configuration against the cloud server.", [this]));
    },
    
    uploadImage: function(config, callback) {
        throw new Error(Ember.String.fmt("%@ has to implement uploadImage() method which is required to upload images to the cloud server.", [this]));
    }
    
});

export default BaseAdapter;

