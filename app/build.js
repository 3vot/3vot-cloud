var Q = require("q");
var colors = require('colors');
var Path = require('path');
var fs = require("fs")
var Builder = require("../utils/builder")
var WalkDir = require("../utils/walk")
var rimraf = require("rimraf")
var mkpath = require("mkpath")

var App = require("../models/app")
var Log = require("../utils/log")


var promptOptions= { 
  app_name: null,
  target: null
}

var tempVars={
  app: null,
  app_path: null
}

function execute( app_name, target, buildDependency, domain ){
  Log.debug("Building App " + app_name, "app/build", 35)

  var deferred = Q.defer();
  var pkgPath = Path.join( process.cwd(), "3vot.json");
  var pck  = require(pkgPath);

  var appPkgPath = Path.join( process.cwd(), "apps", app_name, "package.json");
  var appPkg  = require(appPkgPath);

  promptOptions= { 
    app_name: app_name,
    target: target,
    package: pck,
    app_package: appPkg,
    domain: domain
  }

  tempVars.appPath =  Path.join( process.cwd(), "apps", app_name);

  rimrafApp()
  .then( function(){ return Builder.buildApp( promptOptions.app_name, pck.user_name ) }  )
  .then( function(){ return transformAssets( promptOptions.app_name ) })
  .then( function(){ return deferred.resolve(promptOptions.app_name) })
  .fail( function(err){ deferred.reject(err); })

  return deferred.promise;
}

function rimrafApp(){
  var deferred = Q.defer();

  var path = Path.join( tempVars.appPath, "app")
  rimraf(path, function(err){
    if(err) return deferred.reject(err)
    fs.mkdir(path, function(err){
      if(err) return deferred.reject(err)
      return deferred.resolve()
    });
  })
  return deferred.promise;
}

function transformAssets(app_name){
  var assets = WalkDir( tempVars.appPath );
  assets.forEach( function(path){
    if(transformPath(path.path)){
      var file = fs.readFileSync( path.path); 
      var relativeFilePath = path.path.split( tempVars.appPath )[1]; 
      var dirPath = relativeFilePath.substr(0, relativeFilePath.lastIndexOf("/") );
      dirPath = Path.join( tempVars.appPath , "app", dirPath );
      mkpath.sync( dirPath );
      var filePath = Path.join( tempVars.appPath, "app", relativeFilePath);
      fs.writeFileSync( filePath  , file );
    }
  });
}

var pathsToExclude = ["code", "app", "node_modules","package.json",".git",".gitignore"] 
function transformPath(filePath){
  for (var i = pathsToExclude.length - 1; i >= 0; i--) {
    var excludePath = pathsToExclude[i];
    if(filePath.indexOf( Path.join(tempVars.appPath, excludePath) ) == 0){
      Log.debug("Excluding Path: " + filePath, "app/build", 87);
      return false;
    }
    var dirPath = filePath.substr(0, filePath.lastIndexOf("/") );
    if( dirPath == tempVars.appPath && Path.extname(filePath) == ".js" ) return false
  };
  return true
}

module.exports = execute;