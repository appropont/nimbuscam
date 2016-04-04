/*global jQuery */
/*global AWS */
/*global console */

//imports
import Ember from 'ember';
import BaseAdapter from "./base";
import DataURLToBlobHelper from "../helpers/dataURLToBlob";


//Bootstrapping localConfig
var defaultConfig = {};
if(typeof window.localConfig !== "undefined") {
    defaultConfig = window.localConfig.s3;
} else {
    defaultConfig = Ember.Object.create({
        accessKey: "",
        secretKey: "",
        bucketName: "",
        subdirectory: "",
        region: "us-east-1"
    });
}


var s3Adapter = BaseAdapter.extend({

    name: "Amazon S3",
    config: defaultConfig,
    configTemplate: "adapters/s3config",
    logoURL: "images/repos/amazon-s3.png",
    
    fetchSDK: function() {
    
        var promise;
        
        Ember.run(function() {
    
            promise = new Ember.RSVP.Promise(function(resolve, reject) {
                jQuery.getScript("https://sdk.amazonaws.com/js/aws-sdk-2.0.0-rc13.min.js")
                    .done(function(script, textStatus) {
                        Ember.run(function() {
                            resolve(textStatus);
                        });
                    })
                    .fail(function(jqxhr, settings, exception) {
                        Ember.run(function() {
                            reject(exception);
                        });
                });
            });
        
        });
        
        return promise;
    },
    
    validateConfig: function() {
    
        var self = this;
        
        var config = self.get('config');
        
        console.log(AWS);
        //validate config values here for length and allowed characters before initiating server-side validation   
        
        
        //local validation passed, now start server-side validation with Amazon
        var promise;
        
        Ember.run(function() {
            promise = new Ember.RSVP.Promise(function(resolve, reject) {
                AWS.config.update({
                    accessKeyId: config.accessKey,
                    secretAccessKey: config.secretKey,
                });
                
                AWS.config.region = config.region;
                
                var s3 = new AWS.S3({
                    accessKeyId: config.accessKey,
                    secretAccessKey: config.secretKey,
                    params: {Bucket: config.bucketName}
                });
                                
                s3.listObjects({ Bucket: config.bucketName }, function(err, data) {
                
                    Ember.run(function() {
                
                        if(!!err) {
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    
                    });
                    
                });      
            });
        });
        
        return promise;
        
    },
    
    //arg: image = { timestamp:epoch, data: dataURL }
    //Must take a dataURL instead of passing in the original canvasElement 
    //    because s3Adapter shouldn't need to know jpegQuality, etc
    uploadFrame: function(image) {
        var self = this;

        var config = self.get('config');
        
        var promise;
        
        Ember.run(function() {
        
            promise = new Ember.RSVP.Promise(function(resolve, reject) {
            
                AWS.config.update({
                    accessKeyId: config.accessKey,
                    secretAccessKey: config.secretKey,
                });                
                
                AWS.config.region = config.region;
                
                var s3 = new AWS.S3({                    
                    accessKeyId: config.accessKey,
                    secretAccessKey: config.secretKey,
                    params: {Bucket: config.bucketName}
                });
                
                var s3body =  DataURLToBlobHelper.dataURLToBlob(image.dataURL);

                if(s3body === false) {
                    console.log('s3body conversion failed');
                    reject(false);
                    return false;
                }
                
                
                try {
                    s3.putObject({
                        Key: config.subdirectory + image.timestamp + '.jpg',
                        Body: s3body
                    }, function(err, data) {
                        Ember.run(function() {
                            if(!!err) {
                                console.log('UploadFrame Failed');
                                console.log(err, err.stack);
                                reject(err);
                                return;
                            } else {
                                console.log('UploadFrame Succeeded');
                                console.log(data);
                                resolve(data);
                                return;
                            }
                        });
                    });
                } catch(error) {
                    reject(error);
                    return false;
                }
                
            });
        
        });
        
        return promise;
        
    }
    
});

export default s3Adapter;


