/*
 * The name is local storage, but under the hood it is using indexeddb because of higher MB limit in most browsers.
 */

/*global jQuery */
/*global AWS */
/*global console */

//imports
import Ember from 'ember';
import BaseAdapter from "./base";
import DataURLToBlobHelper from "../helpers/dataURLToBlob";

// IndexedDB
/*
Note: The recommended way to do this is assigning it to window.indexedDB,
to avoid potential issues in the global scope when web browsers start
removing prefixes in their implementations.
You can assign it to a varible, like var indexedDB… but then you have
to make sure that the code is contained within a function.
*/
var 
	indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.OIndexedDB || window.msIndexedDB,
	IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.OIDBTransaction || window.msIDBTransaction,
	dbVersion = 2;



var localAdapter = BaseAdapter.extend({

    name: "Local Storage",
    config: null,
    configTemplate: "adapters/local",
    logoURL: "//a1.awsstatic.com/images/logos/aws_logo.png",

    //Private Methods
	_localStorageSupported : function() {
	    return !!indexedDB;
	},

	//Adapter Methods (all required to conform to adapter spec)
	fetchSDK : function() {
		
		var self = this;

		var promise;

		Ember.run(function() {

			promise = new Ember.RSVP.Promise(function(resolve, reject) {
				var request = indexedDB.open('frames', dbVersion);

				// Run migrations if necessary
			    request.onupgradeneeded = function(e) {
			        self.db = e.target.result;
			        e.target.transaction.onerror = function(e) {
			        	console.log('migration transaction error');
			        	reject(e);
			        };
			        self.db.createObjectStore('frame', { keyPath: 'timestamp' });
			    };

				request.onsuccess = function(e) {
					self.db = e.target.result;
					resolve('db opened');
				};

				request.onerror = function(e) {
					console.log('db open error');
					reject(e);
				};

			});

		});

		return promise;

	},

	validateConfig : function() {
		//No config to validate
		return true;
	},

	//arg: image = { timestamp:epoch, data: dataURL }
    uploadFrame: function(image) {

    	var self = this;

    	var promise;

    	Ember.run(function() {
    		promise = Ember.RSVP.Promise(function(resolve, reject) {
    			var transaction = self.db.transaction(['frame'], 'readwrite');
			    var store = transaction.objectStore('frame');
			    var request = store.put(image);

			    transaction.oncomplete = function(e) {
			    	resolve('success');
			    };
			    request.onerror = function(e) {
			    	console.log('upload frame request error');
			    	reject(e);
			    };
    		});
    	});

    	return promise;
    	
    }

});

export default localAdapter;