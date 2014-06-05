var fs = require('fs');
var Aws = require("aws-sdk");
var Semver = require("semver");
var fstream = require("fstream");
var tar = require("tar");
var zlib = require("zlib");
var Q = require("q");
var colors = require('colors');
var Parse = require('parse').Parse;
var mime = require('mime')
var Path = require('path');
var prompt = require("prompt")
var eco = require("eco")
var AwsCredentials = require("../aws/credentials");

var rimraf = require("rimraf")

var Install = require("../utils/install")

var Log = require("../utils/log")

var App = require("../models/app")
var AppBuild = require("./build")


var promptOptions= { 
  user_name: null,
  public_dev_key: null,
  app_name: null,
  app_user_name: null,
  app_version: null,
  app_new_name: null,
  paths: null
}

var tempVars= {
  app: null
}

function execute( options ){
  Log.info("Downloading " +  options.app_name + " from the 3VOT Marketplace")
  if(!options.app_new_name) options.app_new_name = options.app_name
  var deferred = Q.defer();
  
  if( !options.paths ) options.paths = { sourceBucket: "source.3vot.com", productionBucket: "3vot.com", demoBucket: "demo.3vot.com"}
  promptOptions = options;

  getApp()
  .then( function(){ return AwsCredentials.requestKeysFromProfile(promptOptions.user_name) })
  .then( downloadApp )
 // .then( copyFolder )
  .then( adjustPackage )
 // .then( adjust3vot )
  .then( installDependencies )
  .then( function(){ return AppBuild( promptOptions.app_new_name, "localhost", true ) })
  .then( function(){ deferred.resolve(tempVars.app) })
  .fail( function(err){ return deferred.reject(err); })

  return deferred.promise;
}

function getApp(){
  var deferred = Q.defer();
  
  callbacks={
    done: function(response){
      if(response.body.length == 0) return deferred.reject("App not found")
      tempVars.app = App.last()
      promptOptions.app_version = promptOptions.app_version || tempVars.app.version
      return deferred.resolve( this ) 
    },
    fail: function(error){        
      return deferred.reject( error )
    }
  }

  App.fetch( { query: { select: App.querySimpleByNameAndProfileSecurity, values: [ promptOptions.app_user_name, promptOptions.app_name ] }  }, callbacks )
  
  return deferred.promise;
}

function downloadApp(){
  Log.debug("Downloading Source Code" , "actions/app_download", 80)

  var deferred = Q.defer();
  var s3 = new Aws.S3();

  var key = promptOptions.app_user_name + '/' + tempVars.app.name  + "_" +  promptOptions.app_version + '.3vot';
  
  var params = {Bucket: promptOptions.paths.sourceBucket , Key: key };
  s3.getObject(params).createReadStream().pipe(zlib.createGunzip() ).pipe( tar.Extract( Path.join( process.cwd(), 'apps' ) ) )
  .on("end", function(){ deferred.resolve(); })
  .on("error", function( error ){ console.log("Error with source key: " + key); deferred.reject(error) });
  
  return deferred.promise;
}

function adjustPackage(){
  Log.debug("Adjusting the package.json for your Profile", "actions/app_download", 98);

  var deferred = Q.defer();
  var pck = require( Path.join( process.cwd(), "apps", promptOptions.app_new_name, "package.json" )  );
  var vot = require( Path.join( process.cwd(), "3vot.json" )  );

  pck.name = promptOptions.app_new_name;
  pck.threevot.displayName = promptOptions.app_new_name;

  //if package is our org
  if(promptOptions.user_name == vot.user_name){
    pck.version = "0.0." + tempVars.app.version;
    pck.threevot.version = "" + tempVars.app.version;
    pck.threevot.user_name = vot.user_name;
  }
  else{
    pck.version = "0.0.1";
    pck.threevot.version = "1";
    pck.threevot.user_name = vot.user_name;
  }

  fs.writeFile( Path.join( process.cwd(), "apps", promptOptions.app_new_name, "package.json" ), JSON.stringify(pck,null,'\t') , function(err){
    if(err) return deferred.reject(err);
    deferred.resolve();
  });

  return deferred.promise;

}

function installDependencies(){
  var destinationDir = Path.join( "apps", promptOptions.app_new_name, "node_modules" );
  return Install(promptOptions.app_new_name, destinationDir) 
}

module.exports = execute;