import { test, moduleFor } from 'ember-qunit';


import Index from 'nimbuscamjs/routes/index';

moduleFor('route/index', "Unit - IndexRoute");


    console.log('testing');

test("it exists", function(){
    equal('top', 'top');
});

test("#model", function(){
  deepEqual([], ['red', 'yellow', 'blue']);
});