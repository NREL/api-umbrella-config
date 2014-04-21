'use strict';

var _ = require('lodash'),
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
    this.path = path || process.env.API_UMBRELLA_CONFIG || '/etc/api-umbrella/.runtime.yml';
    this.reload();
  },

  reload: function() {
    if(fs.existsSync(this.path)) {
      var fileData = fs.readFileSync(this.path);
      this.data = yaml.safeLoad(fileData.toString());
    } else {
      this.data = {};
    }

    this.emit('reload');
  },

  get: function(key) {
    return dot.get(this.data, key);
  },

  getAll: function() {
    return this.data;
  },
});

module.exports = Config;
