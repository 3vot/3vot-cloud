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
  uploadApp: null,
  transform: null,
  production: null,
  distPath: null
}

var tempVars = {
  app: null,
  package_json: null,
  app_version: 1,
  dist_path: null
}

function execute(options){
    var deferred = Q.defer();

    if( !options.package.threevot.keys ) tempVars.keys = [options.user.user_name, options.package.name]
    if( !options.promptValues.production ) options.promptValues.production = false
    if( options.promptValues.uploadApp == null ) options.promptValues.uploadApp = true

    promptOptions= options;
    tempVars.key = tempVars.keys.join("/")
    tempVars.dist_path =  Path.join( process.cwd(), promptOptions.package.threevot.distFolder);

    getAppVersion()
    .then( adjustPackage )
    .then( function(){ return AwsCredentials.requestKeysFromProfile( promptOptions.user.user_name, promptOptions.user.public_dev_key) })
    .then( function(){ return AppBuild( promptOptions, tempVars ) } )
    .then( buildPackage )
    .then( uploadSourceCode  )
    .then( uploadAppFiles )
    .then( createApp )
    .then( clearTMPFolder )
    .then( function(){ 
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
        tempVars.app_version = 1;
      }
      else{
        tempVars.app = App.last()
        tempVars.app.version +=1;
        tempVars.app_version = tempVars.app.version;
      }
      return deferred.resolve( this ) 
    },
    fail: function(error){        
      return deferred.reject( error )
    }
  }
  App.fetch( { query: { select: App.querySimpleByNameAndProfileSecurity, values: [ promptOptions.user.user_name, promptOptions.package.name ] }  }, callbacks )
  return deferred.promise;
}

function adjustPackage(){
  //Adjust Package To Version
  var deferred = Q.defer();

  Log.debug("Adjusting the package.json with the new version", "actions/app_upload", 96)

  promptOptions.package.version = "0.0." + tempVars.app_version;
  promptOptions.package.threevot.version = "" + tempVars.app_version;
  fs.writeFile( Path.join( process.cwd(), "package.json" ), JSON.stringify(promptOptions.package,null,'\t') , function(err){
    if(err) return deferred.reject(err);
    deferred.resolve()
  });
  return deferred.promise;
}

function buildPackage(){
  var deferred = Q.defer();
  Log.debug("Building App " + promptOptions.package.name, "actions/app_upload", 96)

  var appFolderReader = fstream.Reader(
    { path: './', 
      type: "Directory", 
      filter: function () {
        return !this.basename.match(/^\./) &&
               !this.basename.match(/^node_modules$/) &&
               !this.basename.match(/^\.git/) &&
               !this.basename.match(/^app$/) 

      }
   });

  var stream = appFolderReader.pipe(tar.Pack()).pipe(zlib.createGzip());
  stream.pipe( fstream.Writer( Path.join( process.cwd(), "tmp", promptOptions.package.name + ".tar.gz") ) )

  stream.on("end", function(){
    var url = Path.join( process.cwd(), "tmp", promptOptions.package.name + ".tar.gz")
    return deferred.resolve(url);
  });

  stream.on("error", function(error){
    return deferred.reject(new Error(error) );
  });
  return deferred.promise;
}

function uploadSourceCode(){
  if (promptOptions.package.threevot.uploadSource === false ) return true;

  var deferred = Q.defer();  

  var fileObject = {
    path: Path.join( process.cwd(), 'tmp', promptOptions.package.name + '.tar.gz'),
    key: tempVars.key  + "_" +  tempVars.app_version  + '.3vot'
  }

  Log.debug("Uploading Package to 3VOT App Store to " + fileObject.key, "actions/app_upload", 139)


  AwsHelpers.uploadFile( promptOptions.package.threevot.paths.sourceBucket, fileObject )
  .then( function(s3Error, data) {
    Log.debug("Package Uploaded Correctly to 3VOT App Store", "actions/app_upload", 150)
    deferred.resolve(data)
  })
  .fail( deferred.reject )

  return deferred.promise;
}

function uploadAppFiles(){
  if (promptOptions.package.threevot.uploadApp === false) return true;

  var deferred = Q.defer();  
  
  uploadPromises = [];
  var baseKey = tempVars.key + "_" + tempVars.app_version;

  var apps = WalkDir( Path.join( process.cwd(), promptOptions.package.threevot.distFolder ) );

  Log.debug("Uploading " + apps.length + " to " + baseKey, "actions/app_upload", 157)

  apps.forEach( function(path){
    if(promptOptions.promptValues.production) path.key = tempVars.key + "/" + path.name
    else path.key = baseKey + "/" + path.name
    
    uploadPromises.push( function(callback) { 
      AwsHelpers.uploadFile( promptOptions.package.threevot.paths.productionBucket, path )
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

  values = {  name: promptOptions.package.name, public_dev_key: promptOptions.user.public_dev_key, user_name: promptOptions.user.user_name, marketing: { name: promptOptions.package.threevot.displayName, description: promptOptions.package.description  } }
  App.create( values, callbacks )
  
  return deferred.promise;
}


function clearTMPFolder(){
  var deferred = Q.defer();
  var path = Path.join( process.cwd(), 'tmp' );
  rimraf(path, function(err){
    return deferred.resolve();
  })

  return deferred.promise;
}

module.exports = execute;