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
  app: null
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
  
  Builder.buildApp( promptOptions.app_name, pck.user_name )
  .then( rimrafAssets )
  .then( function(){ return transformAssets( promptOptions.app_name ) })
  .then( function(){ return deferred.resolve(promptOptions.app_name) })
  .fail( function(err){ deferred.reject(err); })

  return deferred.promise;
}

function rimrafAssets(){
  var deferred = Q.defer();
  
  var path = Path.join( process.cwd(), "apps", promptOptions.app_name, "app", "assets")
  rimraf(path, function(err){
    if(err) return deferred.reject(err)
    fs.mkdir(path, function(err){
      if(err) return deferred.reject(err)
      deferred.resolve()
    });
  })
  return deferred.promise;
}

function transformAssets(app_name){
  
  var assets = WalkDir( Path.join( process.cwd(), "apps", app_name, "assets" ) );

  assets.forEach( function(path){
    var file = fs.readFileSync( path.path);
    
    var filePath = Path.join( process.cwd(), "apps", app_name, "app", "assets", path.name );
    var dirPath = filePath.substr(0, filePath.lastIndexOf("/") );
    mkpath.sync( dirPath );
    fs.writeFileSync( filePath  , file );
    
  });
}

module.exports = execute;