define('nimbuscamjs/adapters', ['exports', './helpers/slugify', './adapters/s3', './adapters/local'], function (exports, SlugifyHelper, S3Adapter, LocalAdapter) {

	'use strict';

	//The individual adapter files define the classes and are then instantiated and mapped here

	//Import needed helpers
	var adapterClasses = [S3Adapter['default'], LocalAdapter['default']];

	var adapters = [];

	for (var i = 0; i < adapterClasses.length; i++) {
		var adapter = adapterClasses[i].create();
		adapters.push({
			name: adapter.name,
			slug: SlugifyHelper['default'].slugify(adapter.name),
			adapter: adapter
		});
	}

	exports['default'] = adapters;

});
define('nimbuscamjs/adapters/base', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    //This is essentially a skeleton for other developers to use as a base for their custom adapters.

    /*jshint -W098 */

    //imports
    var BaseAdapter = Ember['default'].Object.extend({

        //Properties that should be overridden
        name: "Base Adapter",
        logoURL: "",

        config: {},
        configTemplate: "adapters/baseconfig",

        fetchSDK: function () {
            //returns true since no SDK needs fetching (maybe false would be better?)
            return true;
        },

        validateConfig: function (config, callback) {
            throw new Error(Ember['default'].String.fmt("%@ has to implement testConfig() method which is required to verify the user's configuration against the cloud server.", [this]));
        },

        uploadImage: function (config, callback) {
            throw new Error(Ember['default'].String.fmt("%@ has to implement uploadImage() method which is required to upload images to the cloud server.", [this]));
        },
        getUploadedImages: function (config, callback) {
            throw new Error(Ember['default'].String.fmt("%@ has to implement getUploadedImages() method which is required to upload images to the cloud server.", [this]));
        }

    });

    exports['default'] = BaseAdapter;

});
define('nimbuscamjs/adapters/local', ['exports', 'ember', './base', '../helpers/dataURLToBlob'], function (exports, Ember, BaseAdapter, DataURLToBlobHelper) {

	'use strict';

	/*
	 * The name is local storage, but under the hood it is using indexeddb because of higher MB limit in most browsers.
	 */

	/*global jQuery */
	/*global AWS */
	/*global console */

	//imports
	var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.OIndexedDB || window.msIndexedDB,
	    IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.OIDBTransaction || window.msIDBTransaction,
	    dbVersion = 2;



	var localAdapter = BaseAdapter['default'].extend({

		name: "Local Storage",
		config: null,
		configTemplate: "adapters/local",
		//icon from https://www.iconfinder.com/icons/62110/disk_harddrive_storage_icon#size=256 under a free for commercial use license
		logoURL: "/images/repos/local.png",

		//Private Methods
		_localStorageSupported: function () {
			return !!indexedDB;
		},

		//Adapter Methods (all required to conform to adapter spec)
		fetchSDK: function () {
			var self = this;

			var promise;

			Ember['default'].run(function () {
				promise = new Ember['default'].RSVP.Promise(function (resolve, reject) {
					var request = indexedDB.open("frames", dbVersion);

					// Run migrations if necessary
					request.onupgradeneeded = function (e) {
						self.db = e.target.result;
						e.target.transaction.onerror = function (e) {
							console.log("migration transaction error");
							reject(e);
						};
						self.db.createObjectStore("frame", { keyPath: "timestamp" });
					};

					request.onsuccess = function (e) {
						self.db = e.target.result;
						resolve("db opened");
					};

					request.onerror = function (e) {
						console.log("db open error");
						reject(e);
					};
				});
			});

			return promise;
		},

		validateConfig: function () {
			var promise;

			Ember['default'].run(function () {
				promise = new Ember['default'].RSVP.Promise(function (resolve, reject) {
					resolve(true);
				});
			});

			return promise;
		},

		//arg: image = { timestamp:epoch, data: dataURL }
		uploadFrame: function (image) {
			var self = this;

			var promise;

			Ember['default'].run(function () {
				promise = new Ember['default'].RSVP.Promise(function (resolve, reject) {
					var transaction = self.db.transaction(["frame"], "readwrite");
					var store = transaction.objectStore("frame");
					var request = store.put(image);

					transaction.oncomplete = function (e) {
						resolve("success");
					};
					request.onerror = function (e) {
						console.log("upload frame request error");
						reject(e);
					};
				});
			});

			return promise;
		},

		getUploadedImages: function (config) {
			var self = this;

			var promise;

			Ember['default'].run(function () {
				promise = new Ember['default'].RSVP.Promise(function (resolve, reject) {
					var transaction = self.db.transaction("frame", IDBTransaction.READ_ONLY);
					var store = transaction.objectStore("frame");
					var items = [];

					transaction.oncomplete = function (evt) {
						resolve(items);
					};

					var cursorRequest = store.openCursor();

					cursorRequest.onerror = function (error) {
						console.log("cursorRequest error: ", error);
						reject(error);
					};

					cursorRequest.onsuccess = function (evt) {
						var cursor = evt.target.result;
						if (cursor) {
							var wrappedItem = Ember['default'].Object.create({});
							wrappedItem.set("timestamp", cursor.value.timestamp);
							wrappedItem.set("dataURL", cursor.value.dataURL);
							wrappedItem.set("isSelected", false);
							items.push(wrappedItem);
							cursor["continue"]();
						}
					};
				});
			});

			return promise;
		}

	});

	exports['default'] = localAdapter;

});
define('nimbuscamjs/adapters/s3', ['exports', 'ember', './base', '../helpers/dataURLToBlob'], function (exports, Ember, BaseAdapter, DataURLToBlobHelper) {

    'use strict';

    /*global jQuery */
    /*global AWS */
    /*global console */

    //imports
    var defaultConfig = {};
    if (typeof window.localConfig !== "undefined") {
        defaultConfig = window.localConfig.s3;
    } else {
        defaultConfig = Ember['default'].Object.create({
            accessKey: "",
            secretKey: "",
            bucketName: "",
            subdirectory: "",
            region: "us-east-1"
        });
    }


    var s3Adapter = BaseAdapter['default'].extend({

        name: "Amazon S3",
        config: defaultConfig,
        configTemplate: "adapters/s3config",
        logoURL: "/images/repos/amazon-s3.png",

        fetchSDK: function () {
            var promise;

            Ember['default'].run(function () {
                promise = new Ember['default'].RSVP.Promise(function (resolve, reject) {
                    jQuery.getScript("https://sdk.amazonaws.com/js/aws-sdk-2.0.0-rc13.min.js").done(function (script, textStatus) {
                        Ember['default'].run(function () {
                            resolve(textStatus);
                        });
                    }).fail(function (jqxhr, settings, exception) {
                        Ember['default'].run(function () {
                            reject(exception);
                        });
                    });
                });
            });

            return promise;
        },

        validateConfig: function () {
            var self = this;

            var config = self.get("config");

            console.log(AWS);
            //validate config values here for length and allowed characters before initiating server-side validation  


            //local validation passed, now start server-side validation with Amazon
            var promise;

            Ember['default'].run(function () {
                promise = new Ember['default'].RSVP.Promise(function (resolve, reject) {
                    AWS.config.update({
                        accessKeyId: config.accessKey,
                        secretAccessKey: config.secretKey });

                    AWS.config.region = config.region;

                    var s3 = new AWS.S3({
                        accessKeyId: config.accessKey,
                        secretAccessKey: config.secretKey,
                        params: { Bucket: config.bucketName }
                    });

                    s3.listObjects({ Bucket: config.bucketName }, function (err, data) {
                        Ember['default'].run(function () {
                            if (!!err) {
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
        uploadFrame: function (image) {
            var self = this;

            var config = self.get("config");

            var promise;

            Ember['default'].run(function () {
                promise = new Ember['default'].RSVP.Promise(function (resolve, reject) {
                    AWS.config.update({
                        accessKeyId: config.accessKey,
                        secretAccessKey: config.secretKey });

                    AWS.config.region = config.region;

                    var s3 = new AWS.S3({
                        accessKeyId: config.accessKey,
                        secretAccessKey: config.secretKey,
                        params: { Bucket: config.bucketName }
                    });

                    var s3body = DataURLToBlobHelper['default'].dataURLToBlob(image.dataURL);

                    if (s3body === false) {
                        console.log("s3body conversion failed");
                        reject(false);
                        return false;
                    }


                    try {
                        s3.putObject({
                            Key: config.subdirectory + image.timestamp + ".jpg",
                            Body: s3body
                        }, function (err, data) {
                            Ember['default'].run(function () {
                                if (!!err) {
                                    console.log("UploadFrame Failed");
                                    console.log(err, err.stack);
                                    reject(err);
                                    return;
                                } else {
                                    console.log("UploadFrame Succeeded");
                                    console.log(data);
                                    resolve(data);
                                    return;
                                }
                            });
                        });
                    } catch (error) {
                        reject(error);
                        return false;
                    }
                });
            });

            return promise;
        }

    });

    exports['default'] = s3Adapter;

});
define('nimbuscamjs/app', ['exports', 'ember', 'ember/resolver', 'ember/load-initializers', './config/environment'], function (exports, Ember, Resolver, loadInitializers, config) {

  'use strict';

  Ember['default'].MODEL_FACTORY_INJECTIONS = true;

  var App = Ember['default'].Application.extend({
    modulePrefix: config['default'].modulePrefix,
    podModulePrefix: config['default'].podModulePrefix,
    Resolver: Resolver['default']
  });

  loadInitializers['default'](App, config['default'].modulePrefix);

  exports['default'] = App;

});
define('nimbuscamjs/controllers/camera', ['exports', 'ember', '../adapters/base', '../helpers/imagediff'], function (exports, Ember, BaseAdapter, imagediff) {

    'use strict';

    /*global setInterval, clearInterval, console, navigator, MediaStream, global*/

    /*jshint -W098 */ //Prevents "defined but never used" error
    /*jshint -W083 */ //Prevents "don't define functions in a loop" error

    //imports
    var CameraController = Ember['default'].ObjectController.extend({

        needs: ["captures"],

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
        jpegQuality: 80,
        videoWidth: 640,
        videoHeight: 480,
        maxConcurrentUploads: 4,
        keepaliveDuration: 2,

        //UI vars
        webcamFailed: false,

        //webcamView to handle events that need the DOM loaded
        webcamView: Ember['default'].View.extend({
            name: "webcamView",
            //didInsertElement is simply being used as a didLoad/ready() replacement
            didInsertElement: function () {
                console.log("webcamView didInsertElement");
                this.get("controller").send("startStream");
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

        noAdapter: (function () {
            var adapter = this.get("adapter");

            if (adapter === null || BaseAdapter['default'].prototype.isPrototypeOf(adapter)) {
                return false; // for debugging things that dont need an adapter
                //return true;
            } else {
                return false;
            }
        }).property("adapter"),

        isError: (function () {
            if (this.get("noAdapter") === true || this.get("webcamFailed") === true) {
                return true;
            } else {
                return false;
            }
        }).property("noAdapter", "webcamFailed"),

        /*********************************************
         *
         *  Actions
         *
         *********************************************/

        actions: {

            startStream: function () {
                var self = this;

                self.getUserMedia({
                    video: true,
                    audio: false,
                    el: "webcam",
                    extern: null,
                    append: true,
                    noFallback: true, //use if you don't require a fallback

                    width: self.get("videoWidth"),
                    height: self.get("videoHeight"),

                    mode: "callback"

                }).then(function () {
                    self.set("webcamFailed", false);
                }, function (error) {
                    self.set("webcamFailed", true);
                });
            },
            stopStream: function () {
                this.get("webcamStream").stop();
                this.set("webcamStream", null);
            },

            startProcessing: function () {
                var self = this;

                self.set("isProcessing", true);

                //reset stats if box is checked
                if (self.get("resetStatsOnStart") === true) {
                    console.log("resetting stats");
                    self.set("motionDetectedCount", 0);
                    self.set("framesUploadedCount", 0);
                }

                var tempFrameCanvas = document.createElement("canvas");
                tempFrameCanvas.width = self.get("videoWidth");
                tempFrameCanvas.height = self.get("videoHeight");

                self.set("tempFrameCanvas", tempFrameCanvas);

                self.processingInterval = setInterval(function () {
                    self.processCurrentFrame();
                }, 1000 / self.fps);

                self.uploadInterval = setInterval(function () {
                    self.processUploadQueue();
                }, 1000 / 1);
            },

            stopProcessing: function () {
                var self = this;

                self.set("isProcessing", false);

                self.set("tempFrameCanvas", null);

                clearInterval(self.get("processingInterval"));
            },

            applySettings: function () {},

            transitionToCaptures: function () {
                var capturesController = this.get("controllers.captures");
                capturesController.set("adapter", this.adapter);
                console.log("cameraController adapter: ", this.adapter);
                this.transitionToRoute("captures");
            }

        },

        /*********************************************
         *
         *  Internal Functions
         *
         *********************************************/

        //internal functions to make others readable
        processCurrentFrame: function () {
            var self = this,
                videoWidth = self.get("videoWidth"),
                videoHeight = self.get("videoHeight");

            //Get Current Time (microtime)
            var intervalStartTime = Date.now();

            //Copy video Stream to tempFrameCanvas
            self.get("tempFrameCanvas").getContext("2d").drawImage(self.get("videoElement"), 0, 0);

            //if not recording, attend the framebuffer
            if (self.get("isRecording") === false) {
                console.log("processCurrentFrame(): not recording, attending to frame buffer");
                var previousFrame = self.get("previousFrame");
                if (previousFrame !== null) {
                    //place old previousFrame onto buffer
                    self.get("frameBuffer").push(previousFrame);
                    //remove oldest frame from buffer
                    self.get("frameBuffer").shift();
                }
            }

            //assign previousframe from currentframe
            self.set("previousFrame", self.get("currentFrame"));

            //assign currentFrame from tempFrameCanvas
            var tempFrameCanvas = self.get("tempFrameCanvas");
            var currentFrame = {
                timestamp: intervalStartTime,
                imageData: tempFrameCanvas.getContext("2d").getImageData(0, 0, videoWidth, videoHeight),
                imageDataURL: tempFrameCanvas.toDataURL("image/jpeg", self.get("jpegQuality") / 100)
            };
            self.set("currentFrame", currentFrame);

            //after shuffling, if either frame is null break this iteration of the interval
            if (self.get("previousFrame") == null || self.get("currentFrame") == null) {
                console.log("null frame, breaking processing iteration");
                return;
            }

            //converting percentage to pixels for imagediff tolerance
            var minDiffPercent = self.get("minDiff");
            var totalPixels = videoWidth * videoHeight;
            var minDiffPixels = 1 / minDiffPercent * totalPixels;

            var motionDetected = imagediff['default'].equal(self.get("currentFrame").imageData, self.get("previousFrame").imageData, minDiffPercent);

            /* Start of new image compare */

            resemble(self.get("currentFrame").imageDataURL).compareTo(self.get("previousFrame").imageDataURL).onComplete(function (data) {
                if (!data.misMatchPercentage) {
                    return;
                }

                if (data.misMatchPercentage > minDiffPercent) {
                    console.log("MotionDetected");

                    //increment stat counter
                    var detectedCount = self.get("motionDetectedCount") + 1;
                    self.set("motionDetectedCount", detectedCount);

                    //reset keepalive countdown
                    self.set("keepaliveCounter", self.get("keepaliveDuration") * self.get("fps"));

                    if (self.get("isRecording") === false) {
                        self.set("isRecording", true);

                        if (self.get("previousFrameBuffer") !== null && typeof self.get("previousFrameBuffer") !== "undefined") {
                            console.log("transferring previousFrameBuffer to uploadQueue");
                            //transfer previousFrameBuffer to uploadQueue
                            self.get("previousFrameBuffer").forEach(function (frame) {
                                self.get("uploadQueue").push(frame);
                            });
                            self.set("previousFrameBuffer", []);
                        } else {
                            console.log("previousFrameBuffer is empty");
                        }


                        //transfer previousFrame to uploadQueue
                        self.get("uploadQueue").push(self.get("previousFrame"));
                    }

                    //transfer currentFrame to uploadQueue
                    self.get("uploadQueue").push(self.get("currentFrame"));
                } else {
                    //decrement counter
                    self.set("keepaliveCounter", self.get("keepaliveCounter") - 1);

                    if (self.get("keepaliveCounter") <= 0) {
                        self.set("isRecording", false);
                    } else {
                        //transfer currentFrame to uploadQueue
                        self.get("uploadQueue").push(self.get("currentFrame"));
                    }
                }
            });
        },
        processUploadQueue: function () {
            var self = this;

            //If maxConcurrentUploads is full leave this iteration.
            if (self.get("currentUploadCount") >= self.get("maxConcurrentUploads")) {
                console.log("max concurrent uploads");
                return;
            }



            var uploadQueueCount = self.get("uploadQueue").length;

            if (uploadQueueCount > 0) {
                var availableUploads = self.get("maxConcurrentUploads") - self.get("currentUploadCount");

                var spawnCount = Math.min(availableUploads, uploadQueueCount);

                var uploadQueue = self.get("uploadQueue");

                for (var i = 0; i < spawnCount; i++) {
                    var frame = uploadQueue.shift();

                    self.set("uploadQueue", uploadQueue);

                    //Check for empty frame
                    if (frame == null || typeof frame === "undefined" || typeof frame.imageDataURL === "undefined") {
                        console.log("uploadInterval: frame empty");
                    } else {
                        var newUploadCount = self.get("currentUploadCount") + 1;
                        self.set("currentUploadCount", newUploadCount);

                        self.get("adapter").uploadFrame({
                            timestamp: frame.timestamp,
                            dataURL: frame.imageDataURL
                        }).then(function (data) {
                            //Upload success
                            console.log("frame upload success");
                            var currentUploadCount = self.get("currentUploadCount") - 1;
                            self.set("currentUploadCount", currentUploadCount);

                            var framesUploadedCount = self.get("framesUploadedCount") + 1;
                            self.set("framesUploadedCount", framesUploadedCount);
                        }, function (err) {
                            //Still not sure whether adding failed item to front or back of queue is better
                            console.log("frame upload failed");
                            console.log("error: ", err);
                            console.log("failed frame: ", frame);
                            self.get("uploadQueue").push(frame);
                            var currentUploadCount = self.get("currentUploadCount") - 1;
                            self.set("currentUploadCount", currentUploadCount);
                        });
                    }
                }



            } else {
                if (self.get("currentUploadCount") <= 0 && self.get("isProcessing") === false) {
                    clearInterval(self.get("uploadInterval"));
                }
            }
        },

        /*********************************************
         *  The bulk of this function is adapted from Addy Osmani's getUserMedia shim
         *********************************************/
        getUserMedia: function (options) {
            var self = this;

            return new Ember['default'].RSVP.Promise(function (resolve, reject) {
                navigator.getUserMedia_ = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

                if (!!navigator.getUserMedia_) {
                    // constructing a getUserMedia config-object and a string (we will try both)
                    var option_object = {};
                    var option_string = "";
                    var getUserMediaOptions, container, temp, video, ow, oh;

                    if (options.video === true) {
                        option_object.video = true;
                        option_string = "video";
                    }
                    if (options.audio === true) {
                        option_object.audio = true;
                        if (option_string !== "") {
                            option_string = option_string + ", ";
                        }
                        option_string = option_string + "audio";
                    }

                    container = document.getElementById(options.el);
                    temp = document.createElement("video");

                    // Fix for ratio
                    ow = parseInt(container.offsetWidth, 10);
                    oh = parseInt(container.offsetHeight, 10);

                    if (options.width < ow && options.height < oh) {}

                    // configure the interim video
                    temp.width = options.width;
                    temp.height = options.height;
                    temp.autoplay = true;
                    container.appendChild(temp);
                    video = temp;

                    if (!!options.maxWidth) {
                        option_object.maxWidth = options.maxWidth;
                        if (option_string !== "") {
                            option_string = option_string + ", ";
                        }
                        option_string = option_string + "maxWidth: " + options.maxWidth;
                    }

                    // referenced for use in your applications
                    self.set("videoElement", video);

                    //local callbacks since I am wrapping this in a promise
                    var successCallback = function (stream) {
                        var video = self.get("videoElement");

                        if (typeof MediaStream !== "undefined" && MediaStream !== null && stream instanceof MediaStream) {
                            if (video.mozSrcObject !== undefined) {
                                //FF18a
                                video.mozSrcObject = stream;
                            } else {
                                //FF16a, 17a
                                video.src = stream;
                            }

                            video.play();
                        } else {
                            var vendorURL = window.URL || window.webkitURL;
                            video.src = vendorURL ? vendorURL.createObjectURL(stream) : stream;
                        }

                        self.set("webcamStream", stream);


                        video.onerror = function () {
                            console.log("video.onerror");
                            stream.stop();
                            reject();
                        };

                        self.set("videoElement", video);

                        resolve();
                    };

                    var errorCallback = function (error) {
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

    exports['default'] = CameraController;
    //console.log('applySettings Fired');
    //options.width = ow;
    //options.height = oh;

});
define('nimbuscamjs/controllers/captures', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    //imports
    var CapturesController = Ember['default'].ObjectController.extend({

        adapter: null,
        captures: [],

        /*********************************************
         *
         *  Computed Properties
         *
         *********************************************/

        noAdapter: (function () {
            var adapter = this.get("adapter");

            if (adapter === null) {
                return true;
            } else {
                return false;
            }
        }).property("adapter"),

        /*********************************************
         *
         *  Actions
         *
         *********************************************/
        actions: {
            toggleFullSizeImage: function (capture) {
                console.log("showFullSizeImage fired");
                //capture.set('isSelected', true);
                capture.toggleProperty("isSelected");
            }
        }



    });

    exports['default'] = CapturesController;

});
define('nimbuscamjs/controllers/config', ['exports', 'ember', '../adapters/base'], function (exports, Ember, BaseAdapter) {

    'use strict';

    /*jshint -W098 */
    /*global console */

    //imports
    var ConfigController = Ember['default'].ObjectController.extend({

        needs: ["camera"],

        adapter: BaseAdapter['default'].create(),

        //sdk loading
        sdkLoaded: false,
        sdkLoading: false,
        sdkLoadFailed: (function () {
            if (this.get("sdkLoaded") === true && this.get("sdkLoading") === false) {
                return true;
            } else {
                return false;
            }
        }).property("sdkLoaded", "sdkLoading"),

        configValidated: false,

        actions: {

            fetchSDK: function () {
                var self = this;

                self.set("sdkLoading", true);

                console.log("self.adapter");
                console.log(self.adapter);

                self.adapter.fetchSDK().then(function (data) {
                    self.set("sdkLoading", false);
                    self.set("sdkLoaded", true);
                }, function (error) {
                    self.set("sdkLoading", false);
                    self.set("sdkLoadFailed", true);
                });
            },

            validateConfig: function () {
                var self = this;

                this.adapter.validateConfig().then(function (data) {
                    self.set("configValidated", true);
                }, function (error) {
                    self.set("configValidated", false);
                });
            },

            transitionToCamera: function () {
                var cameraController = this.get("controllers.camera");
                cameraController.set("adapter", this.adapter);

                this.transitionToRoute("camera");
            }

        }

    });

    exports['default'] = ConfigController;

});
define('nimbuscamjs/controllers/repos', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    //imports
    var ReposController = Ember['default'].ObjectController.extend({

        needs: ["config"],

        //stub repos
        repos: [{ name: "Amazon S3" }, { name: "Dropbox" }]

    });

    exports['default'] = ReposController;

});
define('nimbuscamjs/controllers/temp', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  //imports
  var TempController = Ember['default'].ObjectController.extend({
    temp: "temp",
    something: "different"
  });

  exports['default'] = TempController;

});
define('nimbuscamjs/helpers/dataURLToBlob', ['exports'], function (exports) {

    'use strict';

    /*global Blob */
    /*global ArrayBuffer */
    /*global Uint8Array */
    /*global atob */
    var dataURLToBlobHelper = {
        dataURLToBlob: function (dataURI) {
            //from http://www.inwebson.com/html5/html5-drag-and-drop-file-upload-with-canvas/

            // convert base64 to raw binary data held in a string
            // doesn't handle URLEncoded DataURIs
            var byteString;
            try {
                byteString = atob(dataURI.split(",")[1]);
            } catch (err) {
                if (!!err) {
                    return false;
                }
            }

            // separate out the mime component
            var mimeString = dataURI.split(",")[0].split(":")[1].split(";")[0];

            // write the bytes of the string to an ArrayBuffer
            var ab = new ArrayBuffer(byteString.length);
            var ia = new Uint8Array(ab);
            for (var i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }

            //Passing an ArrayBuffer to the Blob constructor appears to be deprecated,
            //so convert ArrayBuffer to DataView
            //var dataView = new DataView(ab);
            var blob = new Blob([ia], { type: mimeString });

            return blob;
        }
    };

    exports['default'] = dataURLToBlobHelper;

});
define('nimbuscamjs/helpers/imagediff', ['exports'], function (exports) {

  'use strict';

  /*global Buffer, require*/

  //Modified from
  // js-imagediff 1.0.3
  // (c) 2011-2012 Carl Sutherland, Humble Software
  // Distributed under the MIT License
  // For original source and documentation visit:
  // http://www.github.com/HumbleSoftware/js-imagediff






  var TYPE_ARRAY = /\[object Array\]/i,
      TYPE_CANVAS = /\[object (Canvas|HTMLCanvasElement)\]/i,
      TYPE_CONTEXT = /\[object CanvasRenderingContext2D\]/i,
      TYPE_IMAGE = /\[object (Image|HTMLImageElement)\]/i,
      TYPE_IMAGE_DATA = /\[object ImageData\]/i,
      UNDEFINED = "undefined",
      canvas = getCanvas(),
      context = canvas.getContext("2d"),

  //previous          = root[name],
  imagediff,
      jasmine;

  // Creation
  function getCanvas(width, height) {
    var canvas = document.createElement("canvas");
    if (width) canvas.width = width;
    if (height) canvas.height = height;
    return canvas;
  }
  function getImageData(width, height) {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    return context.createImageData(width, height);
  }


  // Type Checking
  function isImage(object) {
    return isType(object, TYPE_IMAGE);
  }
  function isCanvas(object) {
    return isType(object, TYPE_CANVAS);
  }
  function isContext(object) {
    return isType(object, TYPE_CONTEXT);
  }
  function isImageData(object) {
    return !!(object && isType(object, TYPE_IMAGE_DATA) && typeof object.width !== UNDEFINED && typeof object.height !== UNDEFINED && typeof object.data !== UNDEFINED);
  }
  function isImageType(object) {
    return isImage(object) || isCanvas(object) || isContext(object) || isImageData(object);
  }
  function isType(object, type) {
    return typeof object === "object" && !!Object.prototype.toString.apply(object).match(type);
  }


  // Type Conversion
  function copyImageData(imageData) {
    var height = imageData.height,
        width = imageData.width,
        data = imageData.data,
        newImageData,
        newData,
        i;

    canvas.width = width;
    canvas.height = height;
    newImageData = context.getImageData(0, 0, width, height);
    newData = newImageData.data;

    for (i = imageData.data.length; i--;) {
      newData[i] = data[i];
    }

    return newImageData;
  }
  function toImageData(object) {
    if (isImage(object)) {
      return toImageDataFromImage(object);
    }
    if (isCanvas(object)) {
      return toImageDataFromCanvas(object);
    }
    if (isContext(object)) {
      return toImageDataFromContext(object);
    }
    if (isImageData(object)) {
      return object;
    }
  }
  function toImageDataFromImage(image) {
    var height = image.height,
        width = image.width;
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, width, height);
  }
  function toImageDataFromCanvas(canvas) {
    var height = canvas.height,
        width = canvas.width,
        context = canvas.getContext("2d");
    return context.getImageData(0, 0, width, height);
  }
  function toImageDataFromContext(context) {
    var canvas = context.canvas,
        height = canvas.height,
        width = canvas.width;
    return context.getImageData(0, 0, width, height);
  }
  function toCanvas(object) {
    var data = toImageData(object),
        canvas = getCanvas(data.width, data.height),
        context = canvas.getContext("2d");

    context.putImageData(data, 0, 0);
    return canvas;
  }


  // ImageData Equality Operators
  function equalWidth(a, b) {
    return a.width === b.width;
  }
  function equalHeight(a, b) {
    return a.height === b.height;
  }
  function equalDimensions(a, b) {
    return equalHeight(a, b) && equalWidth(a, b);
  }
  function equal(a, b, tolerance) {
    var aData = a.data,
        bData = b.data,
        length = aData.length,
        i;

    tolerance = tolerance || 0;

    //console.log('aData: ', aData);
    //console.log('bData: ', bData);

    if (!equalDimensions(a, b)) return false;
    for (i = length; i--;) {
      var exactlyEqual = aData[i] !== bData[i];
      var absDiff = Math.abs(aData[i] - bData[i]);
      if (exactlyEqual && absDiff > tolerance) return false;
    }

    return true;
  }


  // Diff
  function diff(a, b, options) {
    return (equalDimensions(a, b) ? diffEqual : diffUnequal)(a, b, options);
  }
  function diffEqual(a, b, options) {
    var height = a.height,
        width = a.width,
        c = getImageData(width, height),
        // c = a - b
    aData = a.data,
        bData = b.data,
        cData = c.data,
        length = cData.length,
        row,
        column,
        i,
        j,
        k,
        v;

    for (i = 0; i < length; i += 4) {
      cData[i] = Math.abs(aData[i] - bData[i]);
      cData[i + 1] = Math.abs(aData[i + 1] - bData[i + 1]);
      cData[i + 2] = Math.abs(aData[i + 2] - bData[i + 2]);
      cData[i + 3] = Math.abs(255 - Math.abs(aData[i + 3] - bData[i + 3]));
    }

    return c;
  }
  function diffUnequal(a, b, options) {
    var height = Math.max(a.height, b.height),
        width = Math.max(a.width, b.width),
        c = getImageData(width, height),
        // c = a - b
    aData = a.data,
        bData = b.data,
        cData = c.data,
        align = options && options.align,
        rowOffset,
        columnOffset,
        row,
        column,
        i,
        j,
        k,
        v;


    for (i = cData.length - 1; i > 0; i = i - 4) {
      cData[i] = 255;
    }

    // Add First Image
    offsets(a);
    for (row = a.height; row--;) {
      for (column = a.width; column--;) {
        i = 4 * ((row + rowOffset) * width + (column + columnOffset));
        j = 4 * (row * a.width + column);
        cData[i + 0] = aData[j + 0]; // r
        cData[i + 1] = aData[j + 1]; // g
        cData[i + 2] = aData[j + 2]; // b
        // cData[i+3] = aData[j+3]; // a
      }
    }

    // Subtract Second Image
    offsets(b);
    for (row = b.height; row--;) {
      for (column = b.width; column--;) {
        i = 4 * ((row + rowOffset) * width + (column + columnOffset));
        j = 4 * (row * b.width + column);
        cData[i + 0] = Math.abs(cData[i + 0] - bData[j + 0]); // r
        cData[i + 1] = Math.abs(cData[i + 1] - bData[j + 1]); // g
        cData[i + 2] = Math.abs(cData[i + 2] - bData[j + 2]); // b
      }
    }

    // Helpers
    function offsets(imageData) {
      if (align === "top") {
        rowOffset = 0;
        columnOffset = 0;
      } else {
        rowOffset = Math.floor((height - imageData.height) / 2);
        columnOffset = Math.floor((width - imageData.width) / 2);
      }
    }

    return c;
  }


  // Validation
  function checkType() {
    var i;
    for (i = 0; i < arguments.length; i++) {
      if (!isImageType(arguments[i])) {
        throw {
          name: "ImageTypeError",
          message: "Submitted object was not an image."
        };
      }
    }
  }


  // Jasmine Matchers
  function get(element, content) {
    element = document.createElement(element);
    if (element && content) {
      element.innerHTML = content;
    }
    return element;
  }

  jasmine = {

    toBeImageData: function () {
      return imagediff.isImageData(this.actual);
    },

    toImageDiffEqual: function (expected, tolerance) {
      if (typeof document !== UNDEFINED) {
        this.message = function () {
          var div = get("div"),
              a = get("div", "<div>Actual:</div>"),
              b = get("div", "<div>Expected:</div>"),
              c = get("div", "<div>Diff:</div>"),
              diff = imagediff.diff(this.actual, expected),
              canvas = getCanvas(),
              context;

          canvas.height = diff.height;
          canvas.width = diff.width;

          div.style.overflow = "hidden";
          a.style.float = "left";
          b.style.float = "left";
          c.style.float = "left";

          context = canvas.getContext("2d");
          context.putImageData(diff, 0, 0);

          a.appendChild(toCanvas(this.actual));
          b.appendChild(toCanvas(expected));
          c.appendChild(canvas);

          div.appendChild(a);
          div.appendChild(b);
          div.appendChild(c);

          return [div, "Expected not to be equal."];
        };
      }

      return imagediff.equal(this.actual, expected, tolerance);
    }
  };


  // Image Output
  function imageDataToPNG(imageData, outputFile, callback) {
    var canvas = toCanvas(imageData),
        base64Data,
        decodedImage;

    callback = callback || Function;

    base64Data = canvas.toDataURL().replace(/^data:image\/\w+;base64,/, "");
    decodedImage = new Buffer(base64Data, "base64");
    require("fs").writeFile(outputFile, decodedImage, callback);
  }


  // Definition
  imagediff = {

    createCanvas: getCanvas,
    createImageData: getImageData,

    isImage: isImage,
    isCanvas: isCanvas,
    isContext: isContext,
    isImageData: isImageData,
    isImageType: isImageType,

    toImageData: function (object) {
      checkType(object);
      if (isImageData(object)) {
        return copyImageData(object);
      }
      return toImageData(object);
    },

    equal: function (a, b, tolerance) {
      checkType(a, b);
      a = toImageData(a);
      b = toImageData(b);
      return equal(a, b, tolerance);
    },
    diff: function (a, b, options) {
      checkType(a, b);
      a = toImageData(a);
      b = toImageData(b);
      return diff(a, b, options);
    },

    jasmine: jasmine,

    // Compatibility
    noConflict: function () {
      //root[name] = previous;
      return imagediff;
    }
  };

  if (typeof module !== "undefined") {
    imagediff.imageDataToPNG = imageDataToPNG;
  }

  var imagediffWrapper = {

    equal: function (a, b, tolerance) {
      try {
        var motionDetected = imagediff.equal(a, b, tolerance);
        return motionDetected;
      } catch (e) {
        console.log("motion detection exception");
        console.log(e);
        return { error: e };
      }
    }

  };



  exports['default'] = imagediffWrapper;

});
define('nimbuscamjs/helpers/slugify', ['exports'], function (exports) {

    'use strict';

    /* jshint -W100 */

    var SlugifyHelper = {
        slugify: function (str) {
            str = str.replace(/^\s+|\s+$/g, ""); // trim
            str = str.toLowerCase();

            // remove accents, swap � for n, etc
            var from = "�����������������������/_,:;";
            var to = "aaaaeeeeiiiioooouuuunc------";
            for (var i = 0, l = from.length; i < l; i++) {
                str = str.replace(new RegExp(from.charAt(i), "g"), to.charAt(i));
            }

            str = str.replace(/[^a-z0-9 -]/g, "") // remove invalid chars
            .replace(/\s+/g, "-") // collapse whitespace and replace by -
            .replace(/-+/g, "-"); // collapse dashes

            return str;
        }
    };

    exports['default'] = SlugifyHelper;

});
define('nimbuscamjs/initializers/app-version', ['exports', '../config/environment', 'ember'], function (exports, config, Ember) {

  'use strict';

  var classify = Ember['default'].String.classify;

  exports['default'] = {
    name: "App Version",
    initialize: function (container, application) {
      var appName = classify(application.toString());
      Ember['default'].libraries.register(appName, config['default'].APP.version);
    }
  };

});
define('nimbuscamjs/initializers/export-application-global', ['exports', 'ember', '../config/environment'], function (exports, Ember, config) {

  'use strict';

  exports.initialize = initialize;

  function initialize(container, application) {
    var classifiedName = Ember['default'].String.classify(config['default'].modulePrefix);

    if (config['default'].exportApplicationGlobal) {
      window[classifiedName] = application;
    }
  };

  exports['default'] = {
    name: "export-application-global",

    initialize: initialize
  };
  exports.__esModule = true;

});
define('nimbuscamjs/router', ['exports', 'ember', './config/environment'], function (exports, Ember, config) {

    'use strict';

    var Router = Ember['default'].Router.extend({
        location: config['default'].locationType });

    Router.map(function () {
        this.route("index", { path: "/" });
        this.route("repos", { path: "/choose-cloud" });
        this.route("config", { path: "/config/:slug" });
        this.route("camera", { path: "/camera" });
        this.route("captures", { path: "/camera/captures" });


        this.route("not-found", { path: "/*path" });
    });

    exports['default'] = Router;

});
define('nimbuscamjs/routes/camera', ['exports', 'ember', '../adapters'], function (exports, Ember, Adapters) {

    'use strict';

    //imports
    var CameraRoute = Ember['default'].Route.extend({
        setupController: function (controller) {
            if (!controller.adapter) {
                this.transitionTo("repos");
            }
        }
    });

    exports['default'] = CameraRoute;

});
define('nimbuscamjs/routes/captures', ['exports', 'ember'], function (exports, Ember) {

    'use strict';

    //imports
    var CapturesRoute = Ember['default'].Route.extend({
        setupController: function (controller) {
            var adapter = controller.get("adapter");
            if (!adapter) {
                this.transitionTo("repos");
            }
            console.log("adapter in capturesRoute setupController: ", adapter);
            if (adapter && typeof adapter.getUploadedImages === "function") {
                adapter.getUploadedImages().then(function (captures) {
                    console.log("captures: ", captures);
                    controller.set("captures", captures);
                });
            } else {
                console.log("getUploadImages not defined");
            }
        }
    });

    exports['default'] = CapturesRoute;

});
define('nimbuscamjs/routes/config', ['exports', 'ember', '../adapters'], function (exports, Ember, Adapters) {

    'use strict';

    //imports
    var ConfigRoute = Ember['default'].Route.extend({
        model: function (params) {
            for (var i = 0; i < Adapters['default'].length; i++) {
                if (Adapters['default'][i].slug === params.slug) {
                    return Adapters['default'][i];
                }
            }
            this.transitionTo("not-found");
        },
        setupController: function (controller, model) {
            this._super(controller, model);
            controller.set("adapter", model.adapter);
            if (!model.adapter.config) {
                controller.set("configValidated", true);
            } else {
                controller.set("configValidated", false);
            }

            controller.send("fetchSDK");
        },
        serialize: function (model) {
            return { slug: model.get("slug") };
        }
    });

    exports['default'] = ConfigRoute;

});
define('nimbuscamjs/routes/index', ['exports', 'ember'], function (exports, Ember) {

	'use strict';

	//imports
	exports['default'] = Ember['default'].Route.extend({});

});
define('nimbuscamjs/routes/repos', ['exports', 'ember', '../adapters'], function (exports, Ember, Adapters) {

    'use strict';

    //imports
    var ReposRoute = Ember['default'].Route.extend({
        setupController: function (controller) {
            controller.set("repos", Adapters['default']);
        }
    });

    exports['default'] = ReposRoute;

});
define('nimbuscamjs/templates/adapters/baseconfig', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    


    data.buffer.push("<h2>Base config</h2>");
    
  });

});
define('nimbuscamjs/templates/adapters/local', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    


    data.buffer.push("<h1>No config necessary</h1>");
    
  });

});
define('nimbuscamjs/templates/adapters/s3config', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    var buffer = '', helper, options, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;


    data.buffer.push("<div id=\"instructions\">\n    \n    <h2>Getting Started</h2>\n    <div>\n        <h3>Step 1</h3>\n        <p>Create a new S3 bucket. You could use an existing one, but from a security standpoint that isn't a good idea.</p>\n        <h3>Step 2</h3>\n        <p>Edit your CORS Configuration in the Permissions tab of your new bucket's Properties.</p>\n    </div>\n    <div>\n        <h3>Example CORS Configuration</h3>\n        <iframe src=\"http://pastebin.com/embed_iframe.php?i=3Qb0PCSk\" style=\"border:none;width:100%;\"></iframe>\n    </div>\n    \n</div>\n\n<legend>S3 Config</legend>\n\n<div class=\"form-group\">\n    <label for=\"bucketName\">Bucket Name</label>\n    ");
    data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
      'type': ("text"),
      'value': ("adapter.config.bucketName"),
      'name': ("bucketName"),
      'class': ("form-control"),
      'placeholder': ("Bucket Name")
    },hashTypes:{'type': "STRING",'value': "ID",'name': "STRING",'class': "STRING",'placeholder': "STRING"},hashContexts:{'type': depth0,'value': depth0,'name': depth0,'class': depth0,'placeholder': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
    data.buffer.push("\n</div>\n\n<div class=\"form-group\">\n    <label for=\"accessKey\">Access Key</label>\n    ");
    data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
      'type': ("text"),
      'value': ("adapter.config.accessKey"),
      'name': ("accessKey"),
      'class': ("form-control"),
      'placeholder': ("Access Key")
    },hashTypes:{'type': "STRING",'value': "ID",'name': "STRING",'class': "STRING",'placeholder': "STRING"},hashContexts:{'type': depth0,'value': depth0,'name': depth0,'class': depth0,'placeholder': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
    data.buffer.push("\n</div>\n\n<div class=\"form-group\">\n    <label for=\"secretKey\">Secret Key</label>\n    ");
    data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
      'type': ("text"),
      'value': ("adapter.config.secretKey"),
      'name': ("secretKey"),
      'class': ("form-control"),
      'placeholder': ("Secret Key")
    },hashTypes:{'type': "STRING",'value': "ID",'name': "STRING",'class': "STRING",'placeholder': "STRING"},hashContexts:{'type': depth0,'value': depth0,'name': depth0,'class': depth0,'placeholder': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
    data.buffer.push("\n</div>\n\n<div class=\"form-group\">\n    <label for=\"subdirectory\">Subdirectory (blank for root)</label>\n    ");
    data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
      'type': ("text"),
      'value': ("adapter.config.subdirectory"),
      'name': ("subdirectory"),
      'class': ("form-control"),
      'placeholder': ("Subdirectory")
    },hashTypes:{'type': "STRING",'value': "ID",'name': "STRING",'class': "STRING",'placeholder': "STRING"},hashContexts:{'type': depth0,'value': depth0,'name': depth0,'class': depth0,'placeholder': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
    data.buffer.push("\n</div>\n");
    return buffer;
    
  });

});
define('nimbuscamjs/templates/application', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    var buffer = '', stack1;


    data.buffer.push("<div>\n    <nav class=\"navbar navbar-default navbar-fixed-top\" role=\"navigation\">\n        <div class=\"navbar-header\">\n            <button type=\"button\" class=\"navbar-toggle\" data-toggle=\"collapse\" data-target=\".navbar-ex1-collapse\">\n                <span class=\"sr-only\">Toggle navigation</span>\n                <span class=\"icon-bar\"></span>\n                <span class=\"icon-bar\"></span>\n                <span class=\"icon-bar\"></span>\n            </button>\n            <a class=\"navbar-brand\" href=\"#\">Nimbuscam.js</a>\n        </div>\n        <div class=\"collapse navbar-collapse navbar-ex1-collapse\">\n        </div>\n    </nav>\n    <div id=\"main\">\n            ");
    stack1 = helpers._triageMustache.call(depth0, "outlet", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n    </div>\n</div>");
    return buffer;
    
  });

});
define('nimbuscamjs/templates/camera', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    var buffer = '', stack1, self=this, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing;

  function program1(depth0,data) {
    
    
    data.buffer.push("\n\n    <div class=\"col-md-8 col-md-offset-2 col-lg-6 col-lg-offset-3\">\n        <h2>No Adapter Loaded</h2>\n        <p>There doesn't seem to be an adapter loaded to connect to a cloud provider.</p>\n        <a>Click here to select your cloud provider.</a>\n    </div>    \n    \n");
    }

  function program3(depth0,data) {
    
    var buffer = '', stack1, helper, options;
    data.buffer.push("\n    <div class=\"col-md-9 col-lg-7\">\n        ");
    stack1 = helpers.unless.call(depth0, "webcamFailed", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("    \n        ");
    stack1 = helpers['if'].call(depth0, "webcamFailed", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(12, program12, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n    </div>\n    <div class=\"col-md-3 col-lg-5\">\n        <div id=\"capture-stats\">\n            <legend>Capture Statistics</legend>\n            ");
    data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
      'type': ("checkbox"),
      'checked': ("resetStatsOnStart"),
      'name': ("reset-stats"),
      'id': ("reset-stats")
    },hashTypes:{'type': "STRING",'checked': "ID",'name': "STRING",'id': "STRING"},hashContexts:{'type': depth0,'checked': depth0,'name': depth0,'id': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
    data.buffer.push("\n            <label for=\"reset-stats\">Reset stats at the start of each session</label>\n            <ul class=\"list-group\">\n                <li class=\"list-group-item\">Motion detected: ");
    stack1 = helpers._triageMustache.call(depth0, "motionDetectedCount", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("</li>\n                <li class=\"list-group-item\">Frames uploaded: ");
    stack1 = helpers._triageMustache.call(depth0, "framesUploadedCount", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("</li>\n                <li class=\"list-group-item captures-link-wrapper\">\n                    <button class=\"captures-link-button btn btn-default\" ");
    data.buffer.push(escapeExpression(helpers.action.call(depth0, "transitionToCaptures", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
    data.buffer.push(">View Captures</button>\n                </li>\n            </ul>\n        </div>\n        <div id=\"capture-settings\" ");
    data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
      'class': ("isProcessing::disabled")
    },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
    data.buffer.push(">\n            <legend>Capture Settings</legend>\n            \n            <div class=\"form-group\">\n                <label for=\"minDiff\">Minimum Diff</label>\n                ");
    data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
      'type': ("number"),
      'value': ("minDiff"),
      'class': ("form-control"),
      'min': (0),
      'max': (100),
      'disabled': ("isProcessing")
    },hashTypes:{'type': "STRING",'value': "ID",'class': "STRING",'min': "INTEGER",'max': "INTEGER",'disabled': "ID"},hashContexts:{'type': depth0,'value': depth0,'class': depth0,'min': depth0,'max': depth0,'disabled': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
    data.buffer.push("\n            </div>\n            \n            <div class=\"form-group\">\n                <label for=\"fps\">FPS</label>\n                ");
    data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
      'type': ("number"),
      'value': ("fps"),
      'class': ("form-control"),
      'min': (1),
      'max': (10),
      'disabled': ("isProcessing")
    },hashTypes:{'type': "STRING",'value': "ID",'class': "STRING",'min': "INTEGER",'max': "INTEGER",'disabled': "ID"},hashContexts:{'type': depth0,'value': depth0,'class': depth0,'min': depth0,'max': depth0,'disabled': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
    data.buffer.push("\n            </div>\n            \n            <div class=\"form-group\">\n                <label for=\"jpegQuality\">JPEG Quality</label>\n                ");
    data.buffer.push(escapeExpression((helper = helpers.input || (depth0 && depth0.input),options={hash:{
      'type': ("number"),
      'value': ("jpegQuality"),
      'class': ("form-control"),
      'min': (1),
      'max': (100),
      'disabled': ("isProcessing")
    },hashTypes:{'type': "STRING",'value': "ID",'class': "STRING",'min': "INTEGER",'max': "INTEGER",'disabled': "ID"},hashContexts:{'type': depth0,'value': depth0,'class': depth0,'min': depth0,'max': depth0,'disabled': depth0},contexts:[],types:[],data:data},helper ? helper.call(depth0, options) : helperMissing.call(depth0, "input", options))));
    data.buffer.push("\n            </div>\n            \n            <button ");
    data.buffer.push(escapeExpression(helpers.action.call(depth0, "applySettings", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
    data.buffer.push(" ");
    data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
      'class': (":btn :btn-lg :btn-block :btn-primary"),
      'disabled': ("isProcessing")
    },hashTypes:{'class': "STRING",'disabled': "ID"},hashContexts:{'class': depth0,'disabled': depth0},contexts:[],types:[],data:data})));
    data.buffer.push(">Apply Settings</button>\n        </div>\n    </div>\n");
    return buffer;
    }
  function program4(depth0,data) {
    
    var buffer = '', stack1;
    data.buffer.push("\n            <div id=\"live-preview\">\n                    \n                    ");
    stack1 = helpers.view.call(depth0, "webcamView", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(5, program5, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n                    \n                    \n                    ");
    stack1 = helpers['if'].call(depth0, "isProcessing", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(10, program10, data),fn:self.program(8, program8, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n                    \n            </div>\n        ");
    return buffer;
    }
  function program5(depth0,data) {
    
    var buffer = '', stack1;
    data.buffer.push("\n                        ");
    stack1 = helpers['if'].call(depth0, "isProcessing", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(6, program6, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n                        <div id=\"webcam\"></div>\n                    ");
    return buffer;
    }
  function program6(depth0,data) {
    
    
    data.buffer.push("\n                            <div class=\"active-notification\">Active</div>\n                        ");
    }

  function program8(depth0,data) {
    
    var buffer = '';
    data.buffer.push("\n                        <button ");
    data.buffer.push(escapeExpression(helpers.action.call(depth0, "stopProcessing", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
    data.buffer.push(" class=\"stop-button btn btn-lg btn-block btn-danger\">Stop</button>\n                    ");
    return buffer;
    }

  function program10(depth0,data) {
    
    var buffer = '';
    data.buffer.push("\n                        <button ");
    data.buffer.push(escapeExpression(helpers.action.call(depth0, "startProcessing", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
    data.buffer.push(" class=\"start-button btn btn-lg btn-block btn-success\">Start</button>\n                    ");
    return buffer;
    }

  function program12(depth0,data) {
    
    
    data.buffer.push("\n            <div>\n                <h2>Webcam Failure</h2>\n                <p>If it was working until you adjusted some settings, try changing them back.</p>\n                <p>If you can't get it back to working, you can <a>reset to the defaults</a></p>\n                <p>If you think the error is caused by something else, please take a look at the <a>support section</a>.</p>\n            </div>\n        ");
    }

    data.buffer.push("<h1>Camera</h1>\n\n");
    stack1 = helpers['if'].call(depth0, "noAdapter", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n");
    return buffer;
    
  });

});
define('nimbuscamjs/templates/captures', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    var buffer = '', stack1, self=this, helperMissing=helpers.helperMissing, escapeExpression=this.escapeExpression;

  function program1(depth0,data) {
    
    var buffer = '', stack1, helper, options;
    data.buffer.push("\r\n			<p class=\"\">You do not have an adapter set. Please go and ");
    stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "repos", options) : helperMissing.call(depth0, "link-to", "repos", options));
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("</p>\r\n		");
    return buffer;
    }
  function program2(depth0,data) {
    
    
    data.buffer.push("Choose A Cloud");
    }

  function program4(depth0,data) {
    
    var buffer = '', stack1;
    data.buffer.push("\r\n			<ul class=\"list-group clearfix\">\r\n		        ");
    stack1 = helpers.each.call(depth0, "capture", "in", "controller.captures", {hash:{},hashTypes:{},hashContexts:{},inverse:self.program(7, program7, data),fn:self.program(5, program5, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\r\n		    </ul>\r\n	    ");
    return buffer;
    }
  function program5(depth0,data) {
    
    var buffer = '', stack1;
    data.buffer.push("\r\n		        	<a href=\"#\" ");
    data.buffer.push(escapeExpression(helpers.action.call(depth0, "toggleFullSizeImage", "capture", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0,depth0],types:["STRING","ID"],data:data})));
    data.buffer.push(" class=\"capture col-sm-4\" ");
    data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
      'class': ("capture.isSelected:zoomed")
    },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},contexts:[],types:[],data:data})));
    data.buffer.push(" >\r\n	                    <img class=\"capture-image\" ");
    data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
      'src': ("capture.dataURL")
    },hashTypes:{'src': "STRING"},hashContexts:{'src': depth0},contexts:[],types:[],data:data})));
    data.buffer.push(" /> \r\n	                    <div class=\"capture-title\">");
    stack1 = helpers._triageMustache.call(depth0, "capture.timestamp", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("</div>\r\n	                </a>\r\n	            ");
    return buffer;
    }

  function program7(depth0,data) {
    
    
    data.buffer.push("\r\n		    		<p>No Captures Found</p>\r\n		        ");
    }

    data.buffer.push("<div id=\"captures\" class=\"col-md-8 col-md-offset-2 col-lg-6 col-lg-offset-3 clearfix\">\r\n	<div class=\"well\">\r\n		<h1>Captures</h1>\r\n		");
    stack1 = helpers['if'].call(depth0, "controller.noAdapter", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\r\n		");
    stack1 = helpers.unless.call(depth0, "controller.noAdapter", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\r\n	</div>\r\n</div>\r\n");
    return buffer;
    
  });

});
define('nimbuscamjs/templates/config', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    var buffer = '', stack1, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing, self=this;

  function program1(depth0,data) {
    
    
    data.buffer.push("    \n            <p>Loading SDK...</p>    \n        ");
    }

  function program3(depth0,data) {
    
    var buffer = '', stack1, helper, options;
    data.buffer.push("\n                <form>\n                    ");
    data.buffer.push(escapeExpression((helper = helpers.partial || (depth0 && depth0.partial),options={hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data},helper ? helper.call(depth0, "adapter.configTemplate", options) : helperMissing.call(depth0, "partial", "adapter.configTemplate", options))));
    data.buffer.push("\n                </form>\n                ");
    stack1 = helpers.unless.call(depth0, "configValidated", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n                ");
    stack1 = helpers['if'].call(depth0, "configValidated", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(6, program6, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n        ");
    return buffer;
    }
  function program4(depth0,data) {
    
    var buffer = '';
    data.buffer.push("\n                    <button ");
    data.buffer.push(escapeExpression(helpers.action.call(depth0, "validateConfig", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
    data.buffer.push(" class=\"btn btn-primary btn-lg btn-block\">Validate Settings</button>\n                ");
    return buffer;
    }

  function program6(depth0,data) {
    
    var buffer = '';
    data.buffer.push("\n                    <button ");
    data.buffer.push(escapeExpression(helpers.action.call(depth0, "transitionToCamera", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["STRING"],data:data})));
    data.buffer.push(" class=\"btn btn-success btn-lg btn-block\">Start Camera</button>\n                ");
    return buffer;
    }

    data.buffer.push("<div id=\"config\" class=\"col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2\">\n    <div class=\"well\">\n        <h1>Config</h1>\n        ");
    stack1 = helpers['if'].call(depth0, "sdkLoading", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n        ");
    stack1 = helpers['if'].call(depth0, "sdkLoaded", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(3, program3, data),contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n    </div>\n</div>");
    return buffer;
    
  });

});
define('nimbuscamjs/templates/error', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    


    data.buffer.push("<h1>Error 2</h1>");
    
  });

});
define('nimbuscamjs/templates/index', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    var buffer = '', stack1, helper, options, self=this, helperMissing=helpers.helperMissing;

  function program1(depth0,data) {
    
    
    data.buffer.push("\n     			<i class=\"fa fa-arrow-circle-right\"></i>\n     			Get Started\n	    	");
    }

    data.buffer.push("<div id=\"home\" class=\"col-md-10 col-md-offset-1 col-lg-8 col-lg-offset-2\">\n	<div class=\"jumbotron\">\n		<div class=\"col-sm-3 centered-content-wrapper\">\n			<img id=\"home-jumbotron-logo\" src=\"/images/nimbuscam.png\" />\n		</div>\n		<div class=\"col-sm-9\">\n		    <h1 id=\"home-title\">Nimbuscam.js</h1>\n		    <p>A cloud-based security camera app</p>\n	    </div>\n	    <div class=\"centered-content-wrapper\">\n	    	");
    stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
      'id': ("getting-started"),
      'class': ("btn btn-success btn-lg")
    },hashTypes:{'id': "STRING",'class': "STRING"},hashContexts:{'id': depth0,'class': depth0},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0],types:["STRING"],data:data},helper ? helper.call(depth0, "repos", options) : helperMissing.call(depth0, "link-to", "repos", options));
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n	    </div>\n	</div>\n\n	<div class=\"well clearfix home-feature\">\n		<div class=\"col-sm-3 home-icon-wrapper\">\n			<i class=\"fa fa-desktop home-feature-icon\"></i>\n		</div>\n		<div class=\"col-sm-9\">\n			<h2>Browser-based</h2>\n			<p>The app itself resides completely in your browser. The only server communication necessary is that of your cloud provider. Of course, you can also run the app without an internet connection and save to your local hard drive.</p>\n		</div>\n	</div>\n\n	<div class=\"well clearfix home-feature\">\n		<div class=\"col-sm-3 home-icon-wrapper\">\n			<i class=\"fa fa-cogs home-feature-icon\"></i>\n		</div>\n		<div class=\"col-sm-9\">\n			<h2>How It Works</h2>\n			<p>Your webcam is accessed using the part of the WebRTC spec in HTML5. By comparing successive framegrabs the app is able to detect \"motion\" and begin uploading the frames to a cloud service or saving them to your local hard drive.</p>\n		</div>\n	</div>\n\n	<div class=\"well clearfix home-feature\">\n		<div class=\"col-sm-3 home-icon-wrapper\">\n			<i class=\"fa fa-github home-feature-icon\"></i>\n		</div>\n		<div class=\"col-sm-9\">\n			<h2>Open Source</h2>\n		    <p>Nimbuscam.js is open source software and is released under the MIT license. Suggestions, bug reports, and pull requests are always welcome.</p>\n		    <a href=\"https://github.com/appropont/nimbuscam.js\"><button class=\"btn btn-primary\"><i class=\"fa fa-arrow-circle-right\"></i> View Source</button></a>\n	    </div>\n	</div>\n</div>\n");
    return buffer;
    
  });

});
define('nimbuscamjs/templates/not-found', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    


    data.buffer.push("<h1>Error</h1>\n");
    
  });

});
define('nimbuscamjs/templates/repos', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    var buffer = '', stack1, escapeExpression=this.escapeExpression, self=this, helperMissing=helpers.helperMissing;

  function program1(depth0,data) {
    
    var buffer = '', stack1, helper, options;
    data.buffer.push("\n                ");
    stack1 = (helper = helpers['link-to'] || (depth0 && depth0['link-to']),options={hash:{
      'class': ("list-group-item repo")
    },hashTypes:{'class': "STRING"},hashContexts:{'class': depth0},inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0,depth0],types:["STRING","ID"],data:data},helper ? helper.call(depth0, "config", "repo.slug", options) : helperMissing.call(depth0, "link-to", "config", "repo.slug", options));
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n	        ");
    return buffer;
    }
  function program2(depth0,data) {
    
    var buffer = '', stack1;
    data.buffer.push("\n                    <img class=\"repo-logo\" ");
    data.buffer.push(escapeExpression(helpers['bind-attr'].call(depth0, {hash:{
      'src': ("repo.adapter.logoURL")
    },hashTypes:{'src': "STRING"},hashContexts:{'src': depth0},contexts:[],types:[],data:data})));
    data.buffer.push(" /> \n                    <h2 class=\"repo-title\">");
    stack1 = helpers._triageMustache.call(depth0, "repo.name", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("</h2>\n                ");
    return buffer;
    }

    data.buffer.push("<div id=\"repos\" class=\"col-md-8 col-md-offset-2 col-lg-6 col-lg-offset-3\">\n	<div class=\"well\">\n		<h1>Repositories</h1>\n		<p>Where would you like to save the motion-detected images?</p>\n	    <ul class=\"list-group\">\n	        ");
    stack1 = helpers.each.call(depth0, "repo", "in", "controller.repos", {hash:{},hashTypes:{},hashContexts:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    data.buffer.push("\n	    </ul>\n	</div>\n</div>\n");
    return buffer;
    
  });

});
define('nimbuscamjs/templates/temp', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
  helpers = this.merge(helpers, Ember['default'].Handlebars.helpers); data = data || {};
    var buffer = '', stack1;


    data.buffer.push("<h1>Temp</h1>\n");
    stack1 = helpers._triageMustache.call(depth0, "something", {hash:{},hashTypes:{},hashContexts:{},contexts:[depth0],types:["ID"],data:data});
    if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
    return buffer;
    
  });

});
define('nimbuscamjs/tests/adapters.jshint', function () {

  'use strict';

  module('JSHint - .');
  test('adapters.js should pass jshint', function() { 
    ok(true, 'adapters.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/adapters/base.jshint', function () {

  'use strict';

  module('JSHint - adapters');
  test('adapters/base.js should pass jshint', function() { 
    ok(true, 'adapters/base.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/adapters/local.jshint', function () {

  'use strict';

  module('JSHint - adapters');
  test('adapters/local.js should pass jshint', function() { 
    ok(true, 'adapters/local.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/adapters/s3.jshint', function () {

  'use strict';

  module('JSHint - adapters');
  test('adapters/s3.js should pass jshint', function() { 
    ok(true, 'adapters/s3.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/app.jshint', function () {

  'use strict';

  module('JSHint - .');
  test('app.js should pass jshint', function() { 
    ok(true, 'app.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/controllers/camera.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/camera.js should pass jshint', function() { 
    ok(false, 'controllers/camera.js should pass jshint.\ncontrollers/camera.js: line 266, col 9, \'resemble\' is not defined.\n\n1 error'); 
  });

});
define('nimbuscamjs/tests/controllers/captures.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/captures.js should pass jshint', function() { 
    ok(true, 'controllers/captures.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/controllers/config.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/config.js should pass jshint', function() { 
    ok(true, 'controllers/config.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/controllers/repos.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/repos.js should pass jshint', function() { 
    ok(true, 'controllers/repos.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/controllers/temp.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/temp.js should pass jshint', function() { 
    ok(true, 'controllers/temp.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/helpers/dataURLToBlob.jshint', function () {

  'use strict';

  module('JSHint - helpers');
  test('helpers/dataURLToBlob.js should pass jshint', function() { 
    ok(true, 'helpers/dataURLToBlob.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/helpers/imagediff.jshint', function () {

  'use strict';

  module('JSHint - helpers');
  test('helpers/imagediff.js should pass jshint', function() { 
    ok(false, 'helpers/imagediff.js should pass jshint.\nhelpers/imagediff.js: line 34, col 16, Expected \'{\' and instead saw \'canvas\'.\nhelpers/imagediff.js: line 35, col 17, Expected \'{\' and instead saw \'canvas\'.\nhelpers/imagediff.js: line 159, col 33, Expected \'{\' and instead saw \'return\'.\nhelpers/imagediff.js: line 163, col 50, Expected \'{\' and instead saw \'return\'.\n\n4 errors'); 
  });

});
define('nimbuscamjs/tests/helpers/resolver', ['exports', 'ember/resolver', '../../config/environment'], function (exports, Resolver, config) {

  'use strict';

  var resolver = Resolver['default'].create();

  resolver.namespace = {
    modulePrefix: config['default'].modulePrefix,
    podModulePrefix: config['default'].podModulePrefix
  };

  exports['default'] = resolver;

});
define('nimbuscamjs/tests/helpers/resolver.jshint', function () {

  'use strict';

  module('JSHint - helpers');
  test('helpers/resolver.js should pass jshint', function() { 
    ok(true, 'helpers/resolver.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/helpers/slugify.jshint', function () {

  'use strict';

  module('JSHint - helpers');
  test('helpers/slugify.js should pass jshint', function() { 
    ok(true, 'helpers/slugify.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/helpers/start-app', ['exports', 'ember', '../../app', '../../router', '../../config/environment'], function (exports, Ember, Application, Router, config) {

  'use strict';



  exports['default'] = startApp;
  function startApp(attrs) {
    var application;

    var attributes = Ember['default'].merge({}, config['default'].APP);
    attributes = Ember['default'].merge(attributes, attrs); // use defaults, but you can override;

    Ember['default'].run(function () {
      application = Application['default'].create(attributes);
      application.setupForTesting();
      application.injectTestHelpers();
    });

    return application;
  }

});
define('nimbuscamjs/tests/helpers/start-app.jshint', function () {

  'use strict';

  module('JSHint - helpers');
  test('helpers/start-app.js should pass jshint', function() { 
    ok(true, 'helpers/start-app.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/router.jshint', function () {

  'use strict';

  module('JSHint - .');
  test('router.js should pass jshint', function() { 
    ok(true, 'router.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/routes/camera.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/camera.js should pass jshint', function() { 
    ok(true, 'routes/camera.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/routes/captures.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/captures.js should pass jshint', function() { 
    ok(false, 'routes/captures.js should pass jshint.\nroutes/captures.js: line 10, col 75, Missing semicolon.\n\n1 error'); 
  });

});
define('nimbuscamjs/tests/routes/config.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/config.js should pass jshint', function() { 
    ok(true, 'routes/config.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/routes/index.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/index.js should pass jshint', function() { 
    ok(true, 'routes/index.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/routes/repos.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/repos.js should pass jshint', function() { 
    ok(true, 'routes/repos.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/test-helper', ['./helpers/resolver', 'ember-qunit'], function (resolver, ember_qunit) {

	'use strict';

	ember_qunit.setResolver(resolver['default']);

});
define('nimbuscamjs/tests/test-helper.jshint', function () {

  'use strict';

  module('JSHint - .');
  test('test-helper.js should pass jshint', function() { 
    ok(true, 'test-helper.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/test-loader', ['ember'], function (Ember) {

  'use strict';

  /* globals requirejs,require */

  //imports
  Ember['default'].keys(requirejs.entries).forEach(function (entry) {
    if (/\-test/.test(entry)) {
      require(entry, null, null, true);
    }
  });

});
define('nimbuscamjs/tests/test-loader.jshint', function () {

  'use strict';

  module('JSHint - .');
  test('test-loader.js should pass jshint', function() { 
    ok(true, 'test-loader.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/unit/routes-test', ['ember-qunit', 'nimbuscamjs/routes/index'], function (ember_qunit, Index) {

  'use strict';

  ember_qunit.moduleFor("route:index", "Unit - IndexRoute");

  ember_qunit.test("it exists", function () {
    equal(2, 2);
  });

  ember_qunit.test("deep equal model", function () {
    deepEqual(["red", "yellow", "blue"], ["red", "yellow", "blue"]);
  });

});
define('nimbuscamjs/tests/unit/routes-test.jshint', function () {

  'use strict';

  module('JSHint - unit');
  test('unit/routes-test.js should pass jshint', function() { 
    ok(true, 'unit/routes-test.js should pass jshint.'); 
  });

});
define('nimbuscamjs/tests/unit/routes/index', ['ember-qunit', 'nimbuscamjs/routes/index'], function (ember_qunit, Index) {

    'use strict';

    ember_qunit.moduleFor("routes/index", "Unit - IndexRoute");


    console.log("testing");

    ember_qunit.test("it exists", function () {
        console.log("testing");
        ok(true);
    });

    ember_qunit.test("#model", function () {
        deepEqual([], ["red", "yellow", "blue"]);
    });

});
define('nimbuscamjs/tests/unit/routes/index.jshint', function () {

  'use strict';

  module('JSHint - unit/routes');
  test('unit/routes/index.js should pass jshint', function() { 
    ok(true, 'unit/routes/index.js should pass jshint.'); 
  });

});
/* jshint ignore:start */

define('nimbuscamjs/config/environment', ['ember'], function(Ember) {
  var prefix = 'nimbuscamjs';
/* jshint ignore:start */

try {
  var metaName = prefix + '/config/environment';
  var rawConfig = Ember['default'].$('meta[name="' + metaName + '"]').attr('content');
  var config = JSON.parse(unescape(rawConfig));

  return { 'default': config };
}
catch(err) {
  throw new Error('Could not read config from meta tag with name "' + metaName + '".');
}

/* jshint ignore:end */

});

if (runningTests) {
  require("nimbuscamjs/tests/test-helper");
} else {
  require("nimbuscamjs/app")["default"].create({"name":"nimbuscamjs","version":"0.0.0.915f8b57"});
}

/* jshint ignore:end */
//# sourceMappingURL=nimbuscamjs.map