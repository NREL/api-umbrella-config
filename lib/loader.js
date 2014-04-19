'use strict';

var _ = require('lodash'),
    cloneDeep = require('clone'),
    fs = require('fs'),
    mongoose = require('mongoose'),
    mergeOverwriteArrays = require('object-extend'),
    yaml = require('js-yaml');

require('../lib/config_version');

var Loader = function() {
  this.initialize.apply(this, arguments);
};

_.extend(Loader.prototype, {
  filePaths: [],
  data: {},
  fileData: {},
  runtimeData: {},
  mongoData: {},

  initialize: function(config) {
    this.config = config;
  },

  setFilePaths: function(paths) {
    this.filePaths = paths;
    this.reload();
  },

  setRuntime: function(data) {
    this.runtimeData = data;
    this.reload();
  },

  reload: function() {
    this.readFiles();
    this.readMongo();
  },

  readFiles: function() {
    var newFileData = {};
    this.filePaths.forEach(function(path) {
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

  connectMongoOnChange: function() {
    var mongoConfig = this.runtimeData.mongodb || this.fileData.mongodb;
    if(this.filePaths && this.filePaths.length > 0 && !mongoConfig) {
      this.ready();
    }

    var configEqual = _.isEqual(this.activeMongoConfig, mongoConfig);
    if(!configEqual) {
      this.activeMongoConfig = cloneDeep(mongoConfig);

      if(this.mongoConnection) {
        this.mongoConnection.close(this.connectMongo.bind(this, mongoConfig));
      } else {
        this.connectMongo(mongoConfig);
      }
    }
  },

  connectMongo: function(mongoConfig) {
    if(mongoConfig) {
      this.mongoConnection = mongoose.createConnection(mongoConfig.url, mongoConfig.options, function(error) {
        if(error) {
          if(global.logger) {
            global.logger.error('mongodb connection error: ', error);
          }

          this.ready();
        }
      }.bind(this));
    }
  },

  readMongo: function() {
    this.connectMongoOnChange();
    if(this.mongoConnection) {
      this.mongoConnection.model('ConfigVersion')
        .find()
        .sort({ version: -1 })
        .limit(1)
        .exec(this.handleMongoFetch.bind(this));
    }
  },

  handleMongoFetch: function(error, configVersions) {
    this.mongoData = {};
    if(configVersions && configVersions[0]) {
      this.mongoData = configVersions[0].config;
    }

    this.combineValues();
    this.ready();
    this.pollMongo();
  },

  ready: function() {
    if(!this.config.isReady) {
      this.config.isReady = true;
      this.config.emit('ready');
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
    var newData = cloneDeep(this.fileData);
    mergeOverwriteArrays(newData, this.mongoData);
    mergeOverwriteArrays(newData, this.runtimeData);

    if(!_.isEqual(newData, this.data)) {
      this.data = newData;

      if(global.logger) {
        global.logger.info('Reading new config (PID ' + process.pid + ')...');
        global.logger.debug(JSON.stringify(this.data, null, 2));
      }

      this.config.emit('reload');
    }
  },
});

module.exports = Loader;
