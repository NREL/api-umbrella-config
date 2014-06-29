'use strict';

var _ = require('lodash'),
    chokidar = require('chokidar'),
    dot = require('dot-component'),
    events = require('events'),
    fs = require('fs'),
    util = require('util'),
    yaml = require('js-yaml');

var Config = function() {
  this.initialize.apply(this, arguments);
};

util.inherits(Config, events.EventEmitter);
_.extend(Config.prototype, {
  data: {},

  initialize: function(path) {
    this.setPath(path);
  },

  setPath: function(path) {
    if(this.fileWatcher) {
      this.fileWatcher.close();
    }

    this.path = path || process.env.API_UMBRELLA_RUNTIME_CONFIG;
    this.reload();

    this.fileWatcher = chokidar.watch(this.path);
    this.fileWatcher.on('change', this.reload.bind(this));
  },

  reload: function() {
    if(fs.existsSync(this.path)) {
      var fileData = fs.readFileSync(this.path);
      this.data = yaml.safeLoad(fileData.toString());
    } else {
      this.data = {};
    }

    this.emit('change');
  },

  get: function(key) {
    return dot.get(this.data, key);
  },

  getAll: function() {
    return this.data;
  },

  close: function(callback) {
    if(this.fileWatcher) {
      this.fileWatcher.close();
    }

    if(callback) {
      callback(null);
    }
  },
});

module.exports = Config;
