var Path = require("path")
var fs = require("fs")
var Q = require("q");
var eco = require("eco")
var prompt = require("prompt")
var Profile = require("../models/profile")
var App = require("../models/app")
var Aws = require("aws-sdk");
var fstream = require("fstream");
var tar = require("tar");
var zlib = require("zlib");
var colors = require('colors');
var mime = require('mime')

var AwsCredentials = require("../aws/credentials");
var AwsHelpers = require("../aws/helpers");
var _3vot = require("3vot")
var AppBuild = require("./build")
var WalkDir = require("../utils/walk")
var App = require("../models/app")
var Log = require("../utils/log")
var async = require("async")

var promptOptions = {
  public_dev_key: null,
  user_name: null,
  app_name: null,
  size: null,
  paths: null,
  keys: null,
  key: null,
  uploadSource: null,
  uploadApp: null
}

var tempVars = {
  app: null,
  package_json: null,
  app_version: 1
}

function execute(options){
    var deferred = Q.defer();
   // if( !options.paths ) options.paths = { sourceBucket: "source.3vot.com", productionBucket: "3vot.com" }
    if( !options.keys ) options.keys = [options.user_name, options.app_name]
    if( !options.production ) options.production = false
    if( !options.uploadSource ) options.uploadSource = true
    if( !options.uploadApp ) options.uploadApp = true

    promptOptions= options;
    promptOptions.key = promptOptions.keys.join("/")

    getAppVersion()
    .then( adjustPackage )
    .then( function(){ return AwsCredentials.requestKeysFromProfile( promptOptions.user_name) })
    .then( function(){ return AppBuild( promptOptions.app_name, "demo", true ) })
    .then( buildPackage )
    .then( uploadSourceCode )
    .then( promptOptions.uploadAppFiles || uploadAppFiles )
    .then( createApp )
    .then( function(){ 
      Log.info("App Available at: http://" + promptOptions.paths.productionBucket + "/" + promptOptions.user_name + "/" + promptOptions.app_name +  "_" + tempVars.app_version )
      return deferred.resolve( tempVars.app ) ;
    })
    .fail( function(err){ return deferred.reject(err); } );
    
    return deferred.promise;
}

function getAppVersion(){
  var deferred = Q.defer();
  
  callbacks={
    done: function(response){
      if(response.body.length == 0){
        tempVars.app_version
      }
      else{
        tempVars.app_version = App.last().version + 1
      }
      return deferred.resolve( this ) 
    },
    fail: function(error){        
      return deferred.reject( error )
    }
  }
  App.fetch( { query: { select: App.querySimpleByNameAndProfileSecurity, values: [ promptOptions.user_name, promptOptions.app_name ] }  }, callbacks )
  return deferred.promise;
}

function adjustPackage(){
  var deferred = Q.defer();

  Log.debug("Adjusting the package.json with the new version", "actions/app_upload", 96)

  var pck = require( Path.join( process.cwd(), "apps", promptOptions.app_name, "package.json" )  );
  var vot = require( Path.join( process.cwd(), "3vot.json" )  )
  pck.version = "0.0." + tempVars.app_version;
  pck.threevot.version = ""+ tempVars.app_version;
  tempVars.package_json = pck;
  fs.writeFile( Path.join( process.cwd(), "apps", promptOptions.app_name, "package.json" ), JSON.stringify(pck,null,'\t') , function(err){
    if(err) return deferred.reject(err);
    deferred.resolve()
  });
  return deferred.promise;
}

function buildPackage(){
  var deferred = Q.defer();
  Log.debug("Building App " + promptOptions.app_name, "actions/app_upload", 96)

  var appFolderReader = fstream.Reader(
    { path: 'apps/' + promptOptions.app_name, 
      type: "Directory", 
      filter: function () {
        return !this.basename.match(/^\./) &&
               !this.basename.match(/^node_modules$/) &&
               !this.basename.match(/^\.git/) 
      }
   });

  var stream = appFolderReader.pipe(tar.Pack()).pipe(zlib.createGzip());
  stream.pipe( fstream.Writer( Path.join( process.cwd(), "tmp", promptOptions.app_name + ".tar.gz") ) )

  stream.on("end", function(){
    var url = Path.join( process.cwd(), "tmp", promptOptions.app_name + ".tar.gz")
    return deferred.resolve(url);
  });

  stream.on("error", function(error){
    return deferred.reject(new Error(error) );
  });
  return deferred.promise;
}

function uploadSourceCode(){
  if (!promptOptions.uploadSource ) return true;
  var deferred = Q.defer();  
  Log.debug("Uploading Package to 3VOT App Store", "actions/app_upload", 139)

  var fileObject = {
    path: Path.join( process.cwd(), 'tmp', promptOptions.app_name + '.tar.gz'),
    key: promptOptions.key  + "_" +  tempVars.app_version  + '.3vot'
  }

  AwsHelpers.uploadFile( promptOptions.paths.sourceBucket, fileObject )
  .then( function(s3Error, data) {
    Log.debug("Package Uploaded Correctly to 3VOT App Store", "actions/app_upload", 150)
    deferred.resolve(data)
  })
  .fail( deferred.reject )

  return deferred.promise;
}

function uploadAppFiles(){
  if (!promptOptions.uploadApp) return true;
  var deferred = Q.defer();  
  Log.debug("Uploading App", "actions/app_upload", 157)
  
  uploadPromises = []
  var apps = WalkDir( Path.join( process.cwd(), "apps", promptOptions.app_name, "app" ) );

  apps.forEach( function(path){
    path.key = promptOptions.key + "/" + tempVars.app_version + "/" + path.name
    uploadPromises.push( function(callback) { 
      AwsHelpers.uploadFile( promptOptions.paths.productionBucket, path )
      .then( function(){ callback(null,true) } ) 
      .fail( function(err){ callback(err) } ) 
    });
  });
  
  async.series( uploadPromises,
  function(err, results){
    if(err) return deferred.reject(err)
    return deferred.resolve()
  });

  return deferred.promise;
}

function createApp(){
  var deferred = Q.defer();
  
  callbacks={
    done: function(){
      tempVars.app = this;
      return deferred.resolve( this ) 
    },
    fail: function(error){        
      return deferred.reject( error )
    }
  }

  values = { billing: { size: promptOptions.size }, name: promptOptions.app_name, public_dev_key: promptOptions.public_dev_key, user_name: promptOptions.user_name, marketing: { name: tempVars.package_json.threevot.displayName, description: tempVars.package_json.description  } }
  App.create( values, callbacks )
  
  return deferred.promise;
}

module.exports = execute;