import { test, moduleFor } from 'ember-qunit';


import Index from 'nimbuscamjs/routes/index';

moduleFor('routes/index', "Unit - IndexRoute");


    console.log('testing');

test("it exists", function(){
    console.log('testing');
  ok(true);
});

test("#model", function(){
  deepEqual([], ['red', 'yellow', 'blue']);
});