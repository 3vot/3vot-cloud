var Q = require("q");
var colors = require('colors');
var Path = require('path');
var App = require("../models/app")
var Install = require("../utils/install")
var Log = require("../utils/log")

var promptOptions= { 
  app_name: null,
}

function execute( options ){
  Log.debug("Installing " +  options.promptValues.app_name, "actions/app_install", 16)
  
  var deferred = Q.defer();
  
  promptOptions = options;

  installDependencies()
  .then( function(){ return deferred.resolve(promptOptions.promptValues.app_name) })
  .fail( function(err){ deferred.reject(err); })

  return deferred.promise;
}

function installDependencies(){
  return Install(promptOptions.promptValues.app_name) 
}

module.exports = execute;