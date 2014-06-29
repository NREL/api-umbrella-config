'use strict';

require('./test_helper');

var async = require('async'),
    config = require('../index'),
    fs = require('fs'),
    mongoose = require('mongoose'),
    os = require('os'),
    path = require('path'),
    sinon = require('sinon'),
    yaml = require('js-yaml');

var ConfigVersion = mongoose.testConnection.model('ConfigVersion');

describe('loader', function() {
  function setupLoader(paths) {
    beforeEach(function(done) {
      if(this.extraLoaderPaths) {
        paths = paths.concat(this.extraLoaderPaths);
      }

      config.loader({
        paths: paths,
      }, function(error, loader) {
        this.loader = loader;
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        done();
      }.bind(this));
    });

    cleanupLoader();
  }

  function cleanupLoader() {
    afterEach(function(done) {
      if(this.loader) {
        this.loader.close(done);
      } else {
        done();
      }
    });

    afterEach(function() {
      if(this.loader && fs.existsSync(this.loader.runtimeFile)) {
        fs.unlinkSync(this.loader.runtimeFile);
      }
    });
  }

  describe('multiple config file', function() {
    setupLoader([
      path.resolve(__dirname, 'config/test.yml'),
      path.resolve(__dirname, 'config/overrides.yml'),
    ]);

    it('overrides simple values', function() {
      this.data.port.should.eql(90);
    });

    it('merges objects', function() {
      this.data.address.city.should.eql('Denver');
      this.data.address.state.should.eql('PA');
    });

    it('replaces arrays', function() {
      this.data.ips.should.eql([
        '2.2.2.1',
        '2.2.2.2',
      ]);
    });
  });

  describe('mongo config data', function() {
    beforeEach(function(done) {
      ConfigVersion.remove({}, function() {
        done();
      });
    });

    beforeEach(function(done) {
      var version = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 0),
        config: {
          port: 71,
        },
      });

      version.save(done);
    });

    setupLoader([
      path.resolve(__dirname, 'config/test.yml'),
      path.resolve(__dirname, 'config/with_mongo.yml'),
    ]);

    it('overrides default config with mongodb data', function() {
      this.data.port.should.eql(71);
    });

    it('polls for mongodb changes', function(done) {
      this.data.port.should.eql(71);
      this.loader.once('change', function() {
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        this.data.port.should.eql(72);
        done();
      }.bind(this));

      var version = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 1),
        config: {
          port: 72,
        },
      });

      version.save();
    });

    it('uses the last config version sorted by time', function(done) {
      this.data.port.should.eql(71);
      this.loader.once('change', function() {
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        this.data.port.should.eql(73);
        done();
      }.bind(this));

      var version1 = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 55),
        config: {
          port: 73,
        },
      });

      var version2 = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 54),
        config: {
          port: 74,
        },
      });

      version1.save();
      version2.save();
    });
  });

  describe('invalid mongo connection', function() {
    setupLoader([
      path.resolve(__dirname, 'config/test.yml'),
      path.resolve(__dirname, 'config/with_invalid_mongo.yml'),
    ]);

    it('still reads file-based data normally', function() {
      this.data.port.should.eql(99);
    });
  });

  describe('config defaults', function() {
    beforeEach(function(done) {
      ConfigVersion.remove({}, function() {
        done();
      });
    });

    cleanupLoader();

    it('only used when file or mongo values are missing', function(done) {
      var version = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 0),
        config: {
          port: 71,
          address: {
            zip: '80401',
          },
        },
      });

      version.save(function() {
        config.loader({
          paths: [
            path.resolve(__dirname, 'config/test.yml'),
            path.resolve(__dirname, 'config/with_mongo.yml'),
          ],
          defaults: {
            address: {
              city: 'Beverly Hills',
              zip: '90210',
              country: 'United States',
            },
          },
        }, function(error, loader) {
          this.loader = loader;
          this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
          this.data.address.state.should.eql('CO');
          this.data.address.zip.should.eql('80401');
          this.data.address.country.should.eql('United States');
          done();
        }.bind(this));
      }.bind(this));
    });
  });

  describe('config overrides', function() {
    beforeEach(function(done) {
      ConfigVersion.remove({}, function() {
        done();
      });
    });

    cleanupLoader();

    it('takes precedence over file and mongo config', function(done) {
      var version = new ConfigVersion({
        version: new Date(2014, 1, 1, 0, 0, 0),
        config: {
          port: 71,
        },
      });

      version.save(function() {
        config.loader({
          paths: [
            path.resolve(__dirname, 'config/test.yml'),
            path.resolve(__dirname, 'config/with_mongo.yml'),
          ],
          overrides: {
            port: 99,
          },
        }, function(error, loader) {
          this.loader = loader;
          this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
          this.data.port.should.eql(99);
          done();
        }.bind(this));
      }.bind(this));
    });
  });

  describe('ready event', function() {
    cleanupLoader();

    it('doesn\'t fire when no data is present', function(done) {
      var spy = sinon.spy();
      this.loader = config.loader({}, spy);

      setTimeout(function() {
        spy.callCount.should.eql(0);
        done();
      }, 50);
    });

    it('fires if no mongodb connection config is present', function(done) {
      var spy = sinon.spy();
      this.loader = config.loader({
        paths: [
          path.resolve(__dirname, 'config/test.yml'),
        ],
      }, spy);

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });

    it('fires after reading the mongodb data', function(done) {
      var spy = sinon.spy();
      this.loader = config.loader({
        paths: [
          path.resolve(__dirname, 'config/with_mongo.yml'),
        ],
      }, spy);

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });

    it('fires if an invalid mongodb connection config is given', function(done) {
      var spy = sinon.spy();
      this.loader = config.loader({
        paths: [
          path.resolve(__dirname, 'config/with_invalid_mongo.yml'),
        ],
      }, spy);

      setTimeout(function() {
        spy.callCount.should.eql(1);
        done();
      }, 50);
    });
  });

  describe('reload', function() {
    beforeEach(function() {
      this.tempPath = path.resolve(__dirname, 'config/temp.yml');
      if(fs.existsSync(this.tempPath)) {
        fs.unlinkSync(this.tempPath);
      }

      this.extraLoaderPaths = [this.tempPath];
    });

    setupLoader([
      path.resolve(__dirname, 'config/test.yml'),
    ]);

    it('reloads file data on command', function(done) {
      this.data.port.should.eql(80);

      this.loader.once('change', function() {
        this.data = yaml.safeLoad(fs.readFileSync(this.loader.runtimeFile).toString());
        this.data.port.should.eql(85);

        fs.unlinkSync(this.tempPath);
        done();
      }.bind(this));

      fs.writeFileSync(this.tempPath, yaml.dump({ port: 85 }));
      this.loader.reload();
    });

    it('only fires when the config values change', function(done) {
      var spy = sinon.spy();
      this.loader.on('change', spy);

      async.series([
        function(callback) {
          fs.writeFileSync(this.tempPath, yaml.dump({ address: { state: 'NY' } }));
          this.loader.reload(callback);
        }.bind(this),
        function(callback) {
          fs.writeFileSync(this.tempPath, yaml.dump({ address: { state: 'NY' } }));
          this.loader.reload(callback);
        }.bind(this),
        function(callback) {
          fs.writeFileSync(this.tempPath, yaml.dump({ address: { state: 'PA' } }));
          this.loader.reload(callback);
        }.bind(this),
      ], function() {
        setTimeout(function() {
          spy.callCount.should.eql(2);
          done();
        }, 50);
      });
    });
  });

  describe('runtime file', function() {
    setupLoader([
      path.resolve(__dirname, 'config/test.yml'),
    ]);

    it('generates a runtime file in the temp directory by default', function() {
      this.loader.runtimeFile.should.match(new RegExp('^' + os.tmpdir() + '/api-umbrella-runtime.+\\.yml$'));
    });

    it('has owner read-write and group-read permissions', function() {
      /* jshint bitwise: false */
      var stat = fs.statSync(this.loader.runtimeFile);
      var mode = stat.mode & parseInt('07777', 8);
      mode.should.eql(parseInt('0640', 8));
    });
  });

  describe('runtime file - custom path', function() {
    beforeEach(function() {
      process.env.API_UMBRELLA_RUNTIME_CONFIG = path.resolve(__dirname, 'config/.runtime.yml');
    });

    setupLoader([
      path.resolve(__dirname, 'config/test.yml'),
    ]);

    afterEach(function() {
      delete process.env.API_UMBRELLA_RUNTIME_CONFIG;
    });

    it('allows overriding the runtime path via the API_UMBRELLA_RUNTIME_CONFIG environment variable', function() {
      this.loader.runtimeFile.should.eql(path.resolve(__dirname, 'config/.runtime.yml'));
    });
  });

  describe('close', function() {
    it('closes the mongo connection on each loader when multiple loaders are created', function(done) {
      var paths = [
        path.resolve(__dirname, 'config/test.yml'),
        path.resolve(__dirname, 'config/with_mongo.yml'),
      ];

      async.times(5, function(index, next) {
        config.loader({
          paths: paths,
        }, function(error, loader) {
          next(error, loader);
        });
      }, function(error, loaders) {
        loaders.length.should.eql(5);
        async.each(loaders, function(loader, callback) {
          // Ensure each loader's mongo connection gets closed.
          loader.mongoConnection.on('close', callback);
          loader.close();

          // Cleanup
          if(fs.existsSync(loader.runtimeFile)) {
            fs.unlinkSync(loader.runtimeFile);
          }
        }, done);
      });
    });
  });
});
