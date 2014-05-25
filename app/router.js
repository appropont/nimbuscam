var Router = Ember.Router.extend({
  location: ENV.locationType
});

Router.map(function() {
    this.route('index', {path : '/'});
    this.route('repos', {path : '/choose-cloud'});
    this.route('config', {path : '/config/:slug'});
    this.route('camera', {path : '/camera'});
});

export default Router;