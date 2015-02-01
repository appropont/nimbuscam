//The individual adapter files define the classes and are then instantiated and mapped here

//Import needed helpers
import SlugifyHelper from "./helpers/slugify";

//Import adapters
import S3Adapter from "./adapters/s3";
import LocalAdapter from "./adapters/local";

var adapterClasses = [
	S3Adapter,
	LocalAdapter
];

var adapters = [];

for(var i = 0; i < adapterClasses.length; i++) {
	var adapter = adapterClasses[i].create();
	adapters.push({
		name: adapter.name,
		slug: SlugifyHelper.slugify(adapter.name),
		adapter: adapter
	});
}

export default adapters;