//The individual adapter files define the classes and are then instantiated and mapped here

//Import needed helpers
import SlugifyHelper from "./helpers/slugify";

//Import adapters
import S3Adapter from "./adapters/s3";



var adapters = [];

//--------------------------------------------------------
//adding s3Adapter
var s3Adapter = S3Adapter.create();
adapters.push({ 
    name: s3Adapter.name,
    slug: SlugifyHelper.slugify(s3Adapter.name), 
    adapter:  s3Adapter
});
//--------------------------------------------------------







export default adapters;