'use strict';

var Config = require('./lib/config'),
    Loader = require('./lib/loader');

module.exports = {
  loader: function(options, callback) {
    return new Loader(options, callback);
  },

  load: function(path) {
    return new Config(path);
  },

  setGlobal: function(path) {
    if(!global.API_UMBRELLA_CONFIG) {
      global.API_UMBRELLA_CONFIG = this.load(path);
    } else {
      global.API_UMBRELLA_CONFIG.setPath(path);
    }
  },

  global: function() {
    return global.API_UMBRELLA_CONFIG;
  },
};
