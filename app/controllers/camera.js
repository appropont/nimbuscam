/*global setInterval, clearInterval, console, navigator, MediaStream, global*/

/*jshint -W098 */ //Prevents "defined but never used" error
/*jshint -W083 */ //Prevents "don't define functions in a loop" error

//imports
import Ember from 'ember';
import BaseAdapter from "../adapters/base";
import imagediff from "../helpers/imagediff";



var CameraController = Ember.ObjectController.extend({

    needs: ['captures'],

    /*********************************************
     *
     *  Properties
     *
     *********************************************/

    adapter: null,
    
    videoElement: null,
    webcamStream: null,
    isProcessing: false,
    processingInterval: null,
    isRecording: false,
    
    //Uploader (may need to abstract to separate class)
    uploadInterval: null,
    uploadQueue: [],
    currentUploadCount: 0,
    keepaliveCounter: 0,
    
    //Frames
    tempFrameCanvas: null,
    previousFrame: null,
    currentFrame: null,
    
    //buffer of generic frameobjects {timestamp, data} used to record images prior to motion detection
    frameBuffer: [],
    
    //Configuration vars and defaults
    minDiff: 20,
    fps: 1,
    jpegQuality:  80,
    videoWidth: 640,
    videoHeight: 480,
    maxConcurrentUploads: 4,
    keepaliveDuration: 2,
    
    //UI vars
    webcamFailed: false,
    
    //webcamView to handle events that need the DOM loaded
    webcamView: Ember.View.extend({
        name: "webcamView",
        //didInsertElement is simply being used as a didLoad/ready() replacement
        didInsertElement: function() {
            console.log("webcamView didInsertElement");
            this.get('controller').send('startStream');
        }
    }),

    //Statistics
    resetStatsOnStart: true,
    motionDetectedCount: 0,
    framesUploadedCount: 0,

    /*********************************************
     *
     *  Computed Properties
     *
     *********************************************/
    
    noAdapter: function() {
    
        var adapter = this.get('adapter');
    
        if(
            adapter === null ||
            BaseAdapter.prototype.isPrototypeOf(adapter)
        ) {        
            return false;// for debugging things that dont need an adapter
            //return true;
        } else {
            return false;
        }
    }.property('adapter'),
    
    isError: function() {
        if(this.get('noAdapter') === true || this.get('webcamFailed') === true) {
            return true;
        } else {
            return false;
        }
        
    }.property('noAdapter', 'webcamFailed'),
    
    /*********************************************
     *
     *  Actions
     *
     *********************************************/

    actions: {
    
        startStream: function() {
                
            var self = this;
        
            self.getUserMedia({
                video: true,
                audio: false,
                el: "webcam",
                extern: null,
                append: true,
                noFallback:true, //use if you don't require a fallback

                width: self.get('videoWidth'),
                height: self.get('videoHeight'),

                mode: "callback"
                
            }).then(
                function() {
                    self.set('webcamFailed', false);
                },
                function(error) {
                    self.set('webcamFailed', true);
                }
            );
            
        },
        stopStream: function() {
            this.get('webcamStream').stop();
            this.set('webcamStream', null);
        },
        
        startProcessing: function() {
        
            var self = this;
            
            self.set('isProcessing', true);

            //reset stats if box is checked
            if(self.get('resetStatsOnStart') === true) {
                console.log('resetting stats');
                self.set('motionDetectedCount', 0);
                self.set('framesUploadedCount', 0);
            }
            
            var tempFrameCanvas = document.createElement('canvas');
            tempFrameCanvas.width = self.get('videoWidth');
            tempFrameCanvas.height = self.get('videoHeight');
            
            self.set('tempFrameCanvas', tempFrameCanvas);
            
            self.processingInterval = setInterval(function() {
            
                self.processCurrentFrame();
                
            }, 1000/self.fps);
            
            self.uploadInterval = setInterval(function() {
                
                self.processUploadQueue();
                
            }, 1000/1);
            
        },
        
        stopProcessing: function() {        
            var self = this;
            
            self.set('isProcessing' ,false);
            
            self.set('tempFrameCanvas', null);
            
            clearInterval(self.get('processingInterval'));
            
        },
        
        applySettings: function() {
            //console.log('applySettings Fired');
        },

        transitionToCaptures: function() {
            var capturesController = this.get("controllers.captures");
            capturesController.set("adapter", this.adapter);
            console.log('cameraController adapter: ', this.adapter);
            this.transitionToRoute("captures");            
        }
        
    },

    /*********************************************
     *
     *  Internal Functions
     *
     *********************************************/

    //internal functions to make others readable
    processCurrentFrame: function() {
        
        var self = this,
            videoWidth = self.get('videoWidth'),
            videoHeight = self.get('videoHeight');
            
        //Get Current Time (microtime)
        var intervalStartTime = Date.now();

        //Copy video Stream to tempFrameCanvas
        self.get('tempFrameCanvas').getContext('2d')
            .drawImage(
                self.get('videoElement'),
                0,
                0
            );
    
        //if not recording, attend the framebuffer
        if(self.get('isRecording') === false) {
            console.log('processCurrentFrame(): not recording, attending to frame buffer');
            var previousFrame = self.get('previousFrame');
            if(previousFrame !== null) {
                //place old previousFrame onto buffer
                self.get('frameBuffer').push(previousFrame);
                //remove oldest frame from buffer
                self.get('frameBuffer').shift();
            }
        }
        
        //assign previousframe from currentframe
        self.set('previousFrame', self.get('currentFrame'));
        
        //assign currentFrame from tempFrameCanvas
        var tempFrameCanvas = self.get('tempFrameCanvas');
        var currentFrame = {
            timestamp: intervalStartTime,
            imageData: tempFrameCanvas.getContext('2d').getImageData(0,0,videoWidth,videoHeight),
            imageDataURL: tempFrameCanvas.toDataURL('image/jpeg', self.get('jpegQuality')/100)
        };
        self.set('currentFrame', currentFrame);
        
        //after shuffling, if either frame is null break this iteration of the interval
        if(self.get('previousFrame') == null || self.get('currentFrame') == null) {
            console.log("null frame, breaking processing iteration");
            return;
        }
        
        //converting percentage to pixels for imagediff tolerance
        var minDiffPercent = self.get('minDiff');
        var totalPixels = videoWidth * videoHeight;
        var minDiffPixels = (1/minDiffPercent) * totalPixels;
                
        var motionDetected = imagediff.equal(
            self.get('currentFrame').imageData, 
            self.get('previousFrame').imageData, 
            minDiffPercent
        );

        /* Start of new image compare */

        resemble(self.get('currentFrame').imageDataURL).compareTo(self.get('previousFrame').imageDataURL).onComplete(function(data) {
            if(!data.misMatchPercentage) {
                return;
            }

            if(data.misMatchPercentage > minDiffPercent) {
                console.log("MotionDetected");  

                //increment stat counter
                var detectedCount = self.get('motionDetectedCount') + 1;
                self.set('motionDetectedCount', detectedCount);
               
                //reset keepalive countdown
                self.set('keepaliveCounter', self.get('keepaliveDuration') * self.get('fps'));
            
                if(self.get('isRecording') === false) {
                
                    self.set('isRecording', true);
                    
                    if(self.get('previousFrameBuffer') !== null && typeof  self.get('previousFrameBuffer') !== 'undefined') {
                        console.log('transferring previousFrameBuffer to uploadQueue');
                        //transfer previousFrameBuffer to uploadQueue
                        self.get('previousFrameBuffer').forEach(function(frame) {
                            self.get('uploadQueue').push(frame);                                
                        });
                        self.set('previousFrameBuffer', []);
                    } else { console.log('previousFrameBuffer is empty'); }
                    
                    
                    //transfer previousFrame to uploadQueue
                    self.get('uploadQueue').push(self.get('previousFrame'));
                    
                }
                
                //transfer currentFrame to uploadQueue
                self.get('uploadQueue').push(self.get('currentFrame'));
            } else {
                //decrement counter
                self.set('keepaliveCounter', self.get('keepaliveCounter') - 1);
            
                if(self.get('keepaliveCounter') <= 0) {
                    self.set('isRecording', false);
                } else {
                    //transfer currentFrame to uploadQueue
                    self.get('uploadQueue').push(self.get('currentFrame'));
                }
            }
        });   
                        
    },
    processUploadQueue: function() {
    
        var self = this;
        
        //If maxConcurrentUploads is full leave this iteration.
        if(self.get('currentUploadCount') >= self.get('maxConcurrentUploads')) {
            console.log('max concurrent uploads');
            return;
        }
        
        
        
        var uploadQueueCount = self.get('uploadQueue').length;
                
        if(uploadQueueCount > 0) {
        
            var availableUploads = self.get('maxConcurrentUploads') - self.get('currentUploadCount');
            
            var spawnCount = Math.min(availableUploads, uploadQueueCount);
            
            var uploadQueue = self.get('uploadQueue');
                        
            for(var i = 0; i < spawnCount; i++) {
                var frame = uploadQueue.shift();

                self.set('uploadQueue', uploadQueue);
                
                //Check for empty frame
                if( frame == null || 
                    typeof frame === 'undefined' || 
                    typeof frame.imageDataURL === 'undefined' 
                ) {
                
                    console.log('uploadInterval: frame empty');
                    
                } else {
                    var newUploadCount = self.get('currentUploadCount') + 1;
                    self.set('currentUploadCount', newUploadCount);
                                        
                    self.get('adapter').uploadFrame({
                        timestamp: frame.timestamp, 
                        dataURL: frame.imageDataURL
                    }).then(
                        function(data) {
                            //Upload success
                            console.log('frame upload success');
                            var currentUploadCount = self.get('currentUploadCount') - 1;      
                            self.set('currentUploadCount', currentUploadCount);

                            var framesUploadedCount = self.get('framesUploadedCount') + 1;
                            self.set('framesUploadedCount', framesUploadedCount);
                        },
                        function(err) {
                            //Still not sure whether adding failed item to front or back of queue is better
                            console.log('frame upload failed');
                            console.log('error: ', err);
                            console.log('failed frame: ', frame);
                            self.get('uploadQueue').push(frame);  
                            var currentUploadCount = self.get('currentUploadCount') - 1;      
                            self.set('currentUploadCount', currentUploadCount);
                        }
                    );
 
                }
            }



            
        } else {
            if(self.get('currentUploadCount') <= 0 && self.get('isProcessing') === false) {
                clearInterval(self.get('uploadInterval'));
            }
        }
        
    },

    /*********************************************
     *  The bulk of this function is adapted from Addy Osmani's getUserMedia shim
     *********************************************/
    getUserMedia: function(options) {
    
        var self = this;
    
        return new Ember.RSVP.Promise(function(resolve, reject) {
        
            navigator.getUserMedia_  = navigator.getUserMedia ||
                                      navigator.webkitGetUserMedia ||
                                      navigator.mozGetUserMedia ||
                                      navigator.msGetUserMedia;
            
            if( !! navigator.getUserMedia_ ) {
                // constructing a getUserMedia config-object and a string (we will try both)
                var option_object = {};
                var option_string = '';
                var getUserMediaOptions, container, temp, video, ow, oh;

                if (options.video === true) {
                    option_object.video = true;
                    option_string = 'video';
                }
                if (options.audio === true) {
                    option_object.audio = true;
                    if (option_string !== '') {
                        option_string = option_string + ', ';
                    }
                    option_string = option_string + 'audio';
                }

                container = document.getElementById(options.el);
                temp = document.createElement('video');

                // Fix for ratio
                ow = parseInt(container.offsetWidth, 10);
                oh = parseInt(container.offsetHeight, 10);

                if (options.width < ow && options.height < oh) {
                    //options.width = ow;
                    //options.height = oh;
                }

                // configure the interim video
                temp.width = options.width;
                temp.height = options.height;
                temp.autoplay = true;
                container.appendChild(temp);
                video = temp;
                
                if (!!options.maxWidth) {
                    option_object.maxWidth = options.maxWidth;
                    if (option_string !== '') {
                        option_string = option_string + ', ';
                    }
                    option_string = option_string + 'maxWidth: ' + options.maxWidth;
                }

                // referenced for use in your applications
                self.set('videoElement', video);
                
                //local callbacks since I am wrapping this in a promise
                var successCallback = function(stream) {
                    var video = self.get('videoElement');

                    if ((typeof MediaStream !== "undefined" && MediaStream !== null) && stream instanceof MediaStream) {

                        if (video.mozSrcObject !== undefined) { //FF18a
                            video.mozSrcObject = stream;
                        } else { //FF16a, 17a
                            video.src = stream;
                        }
                        
                        video.play();

                    } else {                    
                        var vendorURL = window.URL || window.webkitURL;
                        video.src = vendorURL ? vendorURL.createObjectURL(stream) : stream;      
                    }
                                      
                    self.set('webcamStream', stream);
                        

                    video.onerror = function () {
                        console.log('video.onerror');
                        stream.stop();
                        reject();
                    };
                    
                    self.set('videoElement', video);
                    
                    resolve();
                };
                
                var errorCallback = function(error) {
                    reject(error);
                };

                // first we try if getUserMedia supports the config object
                try {
                    // try object
                    navigator.getUserMedia_(option_object, successCallback, errorCallback);
                } catch (e) {
                    // option object fails
                    try {
                        // try string syntax
                        // if the config object failes, we try a config string
                        navigator.getUserMedia_(option_string, successCallback, errorCallback);
                    } catch (e2) {
                        // both failed
                        // neither object nor string works
                        return undefined;
                    }
                }
            }
        });
    }

});

export default CameraController;