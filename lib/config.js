'use strict';

var _ = require('lodash'),
    dot = require('dot-component'),
    events = require('events'),
    Loader = require('./loader'),
    util = require('util');

var Config = function() {
  this.initialize.apply(this, arguments);
};

util.inherits(Config, events.EventEmitter);
_.extend(Config.prototype, {
  initialize: function() {
    this.loader = new Loader(this);
  },

  reload: function() {
    this.loader.reload();
  },

  setFiles: function(paths) {
    this.loader.setFilePaths(paths);
  },

  ready: function(callback) {
    if(this.isReady) {
      callback();
    } else {
      this.once('ready', callback);
    }
  },

  get: function(key) {
    return dot.get(this.loader.data, key);
  },

  getAll: function() {
    return this.loader.data;
  },

  setRuntime: function(config) {
    this.loader.setRuntime(config);
  },

  resetRuntime: function() {
    this.loader.setRuntime({});
  },
});

if(!global.API_UMBRELLA_CONFIG) {
  var config = new Config();
  global.API_UMBRELLA_CONFIG = config;
}

module.exports = global.API_UMBRELLA_CONFIG;
module.exports.klass = Config;
