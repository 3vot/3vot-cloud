var Aws = require("aws-sdk");
var Path = require("path")
var fs = require("fs")
var Q = require("q");
var AwsCredentials = require("../aws/credentials");
var AwsHelpers = require("../aws/helpers");
var AppBuild = require("./build")
var App = require("../models/app")
var Log = require("../utils/log")
var async = require("async")

var promptOptions = {
  user_name: null,
  app_name: null,
  app_version: null,
  paths: null,
  main: false,
  keys:null,
  key:null
}

var tempVars= {
  app: null,
  indexFileContents: null,
  app_keys: null,
  dep_keys: null,
  keys: []
}

function execute(options){
  Log.info("Publishing Apps to the 3VOT Platform")

  var deferred = Q.defer();


  if( !options.paths ) options.paths = { sourceBucket: "source.3vot.com", productionBucket: "3vot.com", demoBucket: "demo.3vot.com"}
  if( !options.keys ) options.keys = [options.user_name, options.app_name]

  promptOptions = options;
  promptOptions.key = promptOptions.keys.join("/")

  getApp()
  .then( function(){ return AwsCredentials.requestKeysFromProfile( promptOptions.user_name) })
  .then( listItems )
  .then( copyItems )
  .then(function(){ 
    var url = "http://3vot.com/" + promptOptions.user_name 
    if( !promptOptions.main ) url += "/" + promptOptions.app_name
    return console.log("App Available at " + url  ) 
    })
  .then(function(){ return deferred.resolve(tempVars.app) } )
  .fail( function(err){ return deferred.reject(err); } )

  return deferred.promise;
}

function getApp(){
  var deferred = Q.defer();
  
  callbacks={
    done: function(response){
      if(response.body.length == 0) throw "App not found, or Wrong Keys+Username pair" 
      tempVars.app = App.last()
      tempVars.key = promptOptions.key + "_" + tempVars.app.version;
      if(!promptOptions.app_version) promptOptions.app_version = tempVars.app.version
      return deferred.resolve( this ) 
    },
    fail: function(error){        
      return deferred.reject( error )
    }
  }
  
  App.fetch( { query: { select: App.querySimpleByNameAndProfileSecurity, values: [ promptOptions.user_name, promptOptions.app_name ] }  }, callbacks )
  
  return deferred.promise;
}


function listItems(){
    var deferred = Q.defer();  

  AwsHelpers.listKeys(promptOptions.paths.productionBucket, tempVars.key)
  .then(function(keys){

    for(index in keys){
      tempVars.keys.push(keys[index].Key);
    }
    deferred.resolve();
  })
  .fail(function(err){ deferred.reject(err) })
  return deferred.promise;
}

function copyItems(){
  var deferred = Q.defer();  
  Log.debug("Copying Items", "actions/publish", 97)

  var copyPromises = []
  tempVars.keys.forEach( function(key){
    copyPromises.push( function(callback) { 
      var newkey = key.replace( "_" + tempVars.app.version, "" );
      AwsHelpers.copyKey( promptOptions.paths.productionBucket , promptOptions.paths.productionBucket + "/" + key, newkey )
      .then( function(){ 
        process.stdout.write(".");
        callback(null,true) } ) 
      .fail( function(err){ callback(err) } ) 
    });
  });
  
  async.series( copyPromises,
  function(err, results){
    if(err) return deferred.reject(err)
    return deferred.resolve()
  });

  return deferred.promise;
}

module.exports = execute;