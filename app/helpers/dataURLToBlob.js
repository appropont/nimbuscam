/*global Blob */
/*global ArrayBuffer */
/*global Uint8Array */
/*global atob */
var dataURLToBlobHelper = {
    dataURLToBlob : function(dataURI) {
        //from http://www.inwebson.com/html5/html5-drag-and-drop-file-upload-with-canvas/
        
        // convert base64 to raw binary data held in a string
        // doesn't handle URLEncoded DataURIs
        var byteString;
        try {
            byteString = atob(dataURI.split(',')[1]);
        } catch(err) {
            if(!!err) {
                return false;
            }
        }

        // separate out the mime component
        var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

        // write the bytes of the string to an ArrayBuffer
        var ab = new ArrayBuffer(byteString.length);
        var ia = new Uint8Array(ab);
        for (var i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }

        //Passing an ArrayBuffer to the Blob constructor appears to be deprecated,
        //so convert ArrayBuffer to DataView
        //var dataView = new DataView(ab);
        var blob = new Blob([ia], {type: mimeString});

        return blob;
    }
};

export default dataURLToBlobHelper;