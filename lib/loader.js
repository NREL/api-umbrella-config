'use strict';

var _ = require('lodash'),
    backoff = require('backoff'),
    cloneDeep = require('clone'),
    events = require('events'),
    fs = require('fs'),
    mongoose = require('mongoose'),
    mergeOverwriteArrays = require('object-extend'),
    util = require('util'),
    temp = require('temp'),
    yaml = require('js-yaml');

require('../lib/config_version');

var Loader = function() {
  this.initialize.apply(this, arguments);
};

util.inherits(Loader, events.EventEmitter);
_.extend(Loader.prototype, {
  data: {},
  fileData: {},
  mongoData: {},

  initialize: function(options, callback) {
    this.options = options || {};
    _.defaults(this.options, {
      paths: [],
      defaults: {},
      overrides: {},
    });

    this.readyCallback = callback;
    this.runtimeFile = process.env.API_UMBRELLA_RUNTIME_CONFIG || temp.path({ prefix: 'api-umbrella-runtime', suffix: '.yml' });

    this.reload();
  },

  reload: function() {
    this.readFiles();
    this.readMongo();
  },

  readFiles: function() {
    var newFileData = {};
    this.options.paths.forEach(function(path) {
      var values = this.readYamlFile(path);
      mergeOverwriteArrays(newFileData, values);
    }.bind(this));

    this.fileData = newFileData;

    this.combineValues();
  },

  readYamlFile: function(path) {
    var values = {};

    if(fs.existsSync(path)) {
      var data = fs.readFileSync(path);
      values = yaml.safeLoad(data.toString());
    }

    return values;
  },

  connectMongoOnChange: function(callback) {
    var mongoConfig = this.fileData.mongodb;
    if(this.options.paths && this.options.paths.length > 0 && !mongoConfig) {
      this.finishReady();
    }

    var configEqual = _.isEqual(this.activeMongoConfig, mongoConfig);
    if(!configEqual) {
      this.activeMongoConfig = cloneDeep(mongoConfig);

      if(this.mongoConnection) {
        this.mongoConnection.close(this.connectMongo.bind(this, mongoConfig, callback));
      } else {
        this.connectMongo(mongoConfig, callback);
      }
    }
  },

  connectMongo: function(mongoConfig, callback) {
    if(mongoConfig) {
      var call = backoff.call(function(backoffCallback) {
        this.mongoConnection = mongoose.createConnection(mongoConfig.url, mongoConfig.options, backoffCallback);
      }.bind(this), callback);

      call.setStrategy(new backoff.ExponentialStrategy({
        initialDelay: 100,
        maxDelay: 30000,
      }));

      call.on('callback', function(error) {
        if(error) {
          if(global.logger) {
            global.logger.error('mongodb connection error: ', error);
          }

          this.finishReady();
        }
      }.bind(this));

      call.on('backoff', function(number, delay) {
        if(global.logger) {
          global.logger.info('mongodb connection retry in ' + delay + 'ms');
        }
      });

      call.start();
    }
  },

  readMongo: function() {
    this.connectMongoOnChange(function() {
      if(this.mongoConnection) {
        this.mongoConnection.model('ConfigVersion')
          .find()
          .sort({ version: -1 })
          .limit(1)
          .exec(this.handleMongoFetch.bind(this));
      }
    }.bind(this));
  },

  handleMongoFetch: function(error, configVersions) {
    this.mongoData = {};
    if(configVersions && configVersions[0]) {
      this.mongoData = configVersions[0].config;
    }

    this.combineValues();
    this.finishReady();

    this.pollMongo();
  },

  finishReady: function() {
    if(!this.isReady) {
      this.isReady = true;
      if(this.readyCallback) {
        this.readyCallback(null, this);
      }
    }
  },

  // FIXME: We're polling for configuration changes from mongoid right now. Not
  // polling would obviously be better. Using something like Zookeeper might be
  // appropriate to better ensure all nodes are running the same config
  // versions at the same time. We could also use Zookeeper to store the active
  // config version on each node so the web admin could more easily keep track
  // of when publishing is complete to all the active nodes.
  pollMongo: function() {
    this.pollMongoTimeout = setTimeout(this.readMongo.bind(this), 500);
  },

  combineValues: function() {
    var newData = cloneDeep(this.options.defaults);
    mergeOverwriteArrays(newData, this.fileData);
    mergeOverwriteArrays(newData, this.mongoData);
    mergeOverwriteArrays(newData, this.options.overrides);

    if(!_.isEqual(newData, this.data)) {
      this.data = newData;

      fs.writeFileSync(this.runtimeFile, yaml.safeDump(this.data), {
        mode: parseInt('0640', 8),
      });

      if(global.logger) {
        global.logger.info('Reading new config (PID ' + process.pid + ')...');
        global.logger.debug(JSON.stringify(this.data, null, 2));
      }

      this.emit('reload');
    }
  },

  close: function(callback) {
    if(this.pollMongoTimeout) {
      clearTimeout(this.pollMongoTimeout);
    }

    if(this.mongoConnection) {
      this.mongoConnection.close();
    }

    if(callback) {
      callback(null);
    }
  },
});

module.exports = Loader;
