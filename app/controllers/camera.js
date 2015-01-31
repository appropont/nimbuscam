/*global setInterval */
/*global clearInterval */
/*global console */
/*global navigator */
/*global MediaStream */

/*jshint -W098 */ //Prevents "defined but never used" error
/*jshint -W083 */ //Prevents "don't define functions in a loop" error

//imports
import Ember from 'ember';
import BaseAdapter from "../adapters/base";
import imagediff from "../helpers/imagediff";


var CameraController = Ember.ObjectController.extend({

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
    
    //buffer of generic frameobjects {timestamp, data}
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
            //console.log("webcamView didLoad");
            this.get('controller').send('startStream');
        }
    }),
    
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
            
            self.set('isProcessing' ,true);
            
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
        }
        
    },
    //internal functions to make others readable
    processCurrentFrame: function() {
        
        var self = this;
            
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
        
            if(self.get('previousFrame') !== null) {
                //place old previousFrame onto buffer
                self.get('frameBuffer').push(self.get('previousFrame'));
                //remove oldest frame from buffer
                self.get('frameBuffer').unshift();            
            }
        }
        
        //assign previousframe from currentframe
        self.set('previousFrame', self.get('currentFrame'));
        
        //assign currentFrame from tempFrameCanvas
        var currentFrame = {};
        currentFrame.timestamp = intervalStartTime;
        currentFrame.data = document.createElement('canvas');
        currentFrame.data.width = self.get('videoWidth');
        currentFrame.data.height = self.get('videoHeight');
        currentFrame.data.getContext('2d').drawImage(
                                                        self.get('tempFrameCanvas'),
                                                        0,
                                                        0
                                                    );
        self.set('currentFrame', currentFrame);
        
        //after shuffling, if either frame is null break this iteration of the interval
        if(self.get('previousFrame') == null || self.get('currentFrame') == null) {
            console.log("null frame, breaking processing iteration");
            return;
        }
        
        
        
        //converting percentage to pixels for imagediff tolerance
        var minDiffPercent = self.get('minDiff');
        var totalPixels = self.get('videoWidth') * self.get('videoHeight');
        var minDiffPixels = (1/minDiffPercent) * totalPixels;
        
        var currentFrameData = self.get('currentFrame').data.getContext('2d').getImageData(0,0,self.get('videoWidth'),self.get('videoHeight'));
        var previousFrameData = self.get('previousFrame').data.getContext('2d').getImageData(0,0,self.get('videoWidth'),self.get('videoHeight'));
        
        var motionDetected = false;
        try {
            motionDetected = imagediff.equal(currentFrameData, previousFrameData, minDiffPixels);
        } catch(e) {
            console.log('motion detection exception');
            console.log(e);
        }
        
                
        if(!!motionDetected) {  
        
            console.log("MotionDetected");     
        
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
                        
    },
    processUploadQueue: function() {
    
        var self = this;
        
        //If maxConcurrentUploads is full leave this iteration.
        if(self.get('currentUploadCount') >= self.get('maxConcurrentUploads')) {
            return;
        }
        
        
        
        //-------------------------------------------------------------------
        //My bug is from not taking the uploadQueueCount into consideration when creating spawnCount
        
        
        var uploadQueueCount = self.get('uploadQueue').length;
                
        if(uploadQueueCount > 0) {
        
            var availableUploads = self.get('maxConcurrentUploads') - self.get('currentUploadCount');
            
            var spawnCount = Math.min(availableUploads, uploadQueueCount);
            
                        
            for(var i = 0; i < spawnCount; i++) {
                var frame = self.get('uploadQueue').shift();
                
                //Check for empty frame
                if( frame == null || 
                    typeof frame === 'undefined' || 
                    typeof frame.data === 'undefined' 
                ) {
                
                    console.log('uploadInterval: frame empty');
                    
                } else {
                
                    self.set('currentUploadCount', self.get('currentUploadCount') + 1);
                    
                    var dataURL = frame.data.toDataURL('image/jpeg', self.get('jpegQuality')/100);
                    
                    var image = document.createElement("img");
                    image.src = dataURL;
                    
                    document.getElementById('webcam').appendChild(image);
                    
                    self.get('adapter').uploadFrame({
                    
                        timestamp: frame.timestamp, 
                        dataURL: dataURL
                        
                    }).then(
                        function(err) {
                            //Still not sure whether adding failed item to front or back of queue is better
                            self.get('uploadQueue').push(frame);                        
                            self.set('currentUploadCount', self.get('currentUploadCount') - 1);
                        },
                        function(data) {
                            //Upload success
                            self.set('currentUploadCount', self.get('currentUploadCount') - 1);
                        }
                    );
 
                }
            }
            
        } else {
        
            //console.log('UploadQueueCount Not Greater Than Zero');
            //console.log('currentUploadCount');
            //console.log(self.get('currentUploadCount'));
            //console.log('isProcessing');
            //console.log(self.get('isProcessing'));
            
        
            if(self.get('currentUploadCount') <= 0 && self.get('isProcessing') === false) {
                clearInterval(self.get('uploadInterval'));
            }
        }
        
    },
    getUserMedia: function(options) {
    
        var self = this;
    
        return new Ember.RSVP.Promise(function(resolve, reject) {
            //This function is adapted from Addy Osmani's getUserMedia shim
        
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