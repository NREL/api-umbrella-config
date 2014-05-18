'use strict';

var Config = require('./lib/config'),
    Loader = require('./lib/loader');

module.exports = {
  loader: function(paths, callback) {
    return new Loader(paths, callback);
  },

  load: function(path) {
    return new Config(path);
  },
};
