import { test, moduleFor } from 'ember-qunit';


import Index from 'nimbuscamjs/routes/index';

moduleFor('route:index', "Unit - IndexRoute");

test("it exists", function(){
    equal(2, 2);
});

test("deep equal model", function(){
  deepEqual(['red', 'yellow', 'blue'], ['red', 'yellow', 'blue']);
});