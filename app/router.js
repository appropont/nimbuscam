import Ember from 'ember';
import config from './config/environment';

var Router = Ember.Router.extend({
    location: config.locationType,
});

Router.map(function() {
    this.route('index', {path : '/'});
    this.route('repos', {path : '/choose-cloud'});
    this.route('config', {path : '/config/:slug'});
    this.route('camera', {path : '/camera'});

    this.route('not-found', { path: '/*path'});
});

export default Router;
