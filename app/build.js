var Q = require("q");
var colors = require('colors');
var Path = require('path');
var fs = require("fs")
var WalkDir = require("../utils/walk")
var rimraf = require("rimraf")
var mkpath = require("mkpath")

var App = require("../models/app")
var Log = require("../utils/log")
var cheerio = require("cheerio")
var Browserify = require("browserify");

var promptOptions= {
  user: null,
  package: null,
  promptValues: null, 
  transform: null //External Transform function to call after build process with tempVars
}

var tempVars={
  app: null,
  app_path: null,
  dist_path: null
}

function execute( options , externalTempVars ){
  var deferred = Q.defer();
  Log.debug("Building App " + options.package.name, "app/build", 35)
  if(externalTempVars) tempVars = externalTempVars;
  tempVars.app_path     =  process.cwd()
  tempVars.dist_path    =  Path.join( tempVars.app_path, options.package.threevot.distFolder );
  tempVars.temp_path    =  Path.join( tempVars.app_path, "tmp");
  tempVars.serverTag    = "{3vot}";

  promptOptions= options;

  if(promptOptions.package.threevot.build === false){
    Log.info("3VOT will not run build process")
    process.nextTick( function(){
      deferred.resolve();
    });
  return deferred.promise;
  }

  build3VOTJS();

  rimrafApp()
  .then( function(){ return Q.all( createBundlesPromises() ) } )
  .then( delete3VOTJS )
  .then( transformAssets )
  .then( transformExcludedAssets  )
  .then( function(){ if(promptOptions.transform) return promptOptions.transform(tempVars); return false; } )
  .then( deferred.resolve )
  .fail( deferred.reject )

  return deferred.promise;
}


function rimrafApp(){
  var deferred = Q.defer();
  rimraf(tempVars.dist_path, function(err){
    if(err) return deferred.reject(err)
    fs.mkdir(tempVars.dist_path, function(err){
      if(err) return deferred.reject(err)
      return deferred.resolve()
    });
  })
  return deferred.promise;
}

function build3VOTJS(){
  var filename = "3vot.js";
  fs.writeFileSync( Path.join(tempVars.app_path, filename), 'require("3vot")( require("./package") )' ) 
}

function delete3VOTJS(){
  var deferred = Q.defer();
  var filename = "3vot.js"
  var filePath  = Path.join(tempVars.app_path, filename);
  fs.stat(filePath, function(err, stat){
    if(err) return deferred.reject(err);
    if(stat.isFile()) fs.unlinkSync(filePath);
    return deferred.resolve()
  });

  return deferred.promise;
}

function createBundlesPromises(){
 var bundlePromises = [];
  var files = fs.readdirSync(tempVars.app_path);
  for (var i = files.length - 1; i >= 0; i--) {
    var file_name = files[i];
    var file_with_path = Path.join( tempVars.app_path , file_name );
    
    var stat = fs.statSync(file_with_path)

    if (!stat.isDirectory() && Path.extname(file_with_path) === ".js"){ 
      bundlePromises.push( bundleEntry( file_name ) );
    }
  }
  return bundlePromises;
}


function bundleEntry(entryName, path){
  var deferred = Q.defer();
  var _this = this;

  var entryWithPath = Path.join( path || tempVars.app_path, entryName)

  var b = Browserify( entryWithPath , {
    extensions: promptOptions.package.threevot.extensions
  });

  _ref = promptOptions.package.threevot.transforms;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    transform = _ref[_i];   
    b.transform(transform);
  }

  for (key in promptOptions.package.threevot.external) {
    dep = promptOptions.package.threevot.external[key];
    b.external(dep);
  }

  b.bundle( {}, 
    function(err, src) {
      if(err && entryName == "3vot.js") return deferred.resolve();
      if (err) return deferred.reject(err)
      fs.writeFileSync( Path.join( tempVars.dist_path, entryName ), src )

      return deferred.resolve(src)
    }
  );
  return deferred.promise;
}

function getDistPaths(filePath){
  var relativeFilePath = filePath.split( tempVars.app_path )[1]; 
  var dirPath = relativeFilePath.substr(0, relativeFilePath.lastIndexOf("/") );
  dirPath = Path.join( tempVars.dist_path, dirPath );
  var filePath = Path.join( tempVars.dist_path, relativeFilePath);
  return [dirPath, filePath];
}

function transformAssets(){
  var deferred = Q.defer();

  var assets = WalkDir( tempVars.app_path );
  assets.forEach( function(path){
    if(transformPath(path.path)){
      var file = fs.readFileSync( path.path); 
      var relativeFilePath = path.path.split( tempVars.app_path )[1]; 
      var dirPath = relativeFilePath.substr(0, relativeFilePath.lastIndexOf("/") );
      dirPath = Path.join( tempVars.dist_path, dirPath );
      mkpath.sync( dirPath );
      var filePath = Path.join( tempVars.dist_path, relativeFilePath);
      fs.writeFileSync( filePath  , file );
    }
  });

  process.nextTick(function(){ 
    return deferred.resolve() 
  });
  return deferred.promise;
}

function transformExcludedAssets(){
  var deferred = Q.defer();

  var indexPath = Path.join( tempVars.app_path, "index.html" );
  fs.readFile(indexPath,"utf-8", function(err, indexBody){
    if(err) return deferred.resolve();

    var $ = cheerio.load( indexBody );
    var filesToInclude = [];

    findParts($("script"))
    findParts($("link"))
    if(filesToInclude.length == 0 ) return deferred.resolve();
    for (var i = filesToInclude.length - 1; i >= 0; i--) {
      copyPart(filesToInclude.pop());
    };



    function findParts(parts){
      parts.each(function(index, part){
        part = $(part);
        var href = part.attr("href");
        var src = part.attr("src");
        var link = href || src || "";
        if( link.indexOf("bower_components") > -1 || link.indexOf("node_modules") > -1) filesToInclude.push( link );
      })
    }


    function copyPart(filePath){
      if(filePath.indexOf("{3vot}") == 0 ) filePath = filePath.substring(6);
      var filePath = Path.join( tempVars.app_path, filePath );
      var fileExt = Path.extname(filePath);
      fs.readFile(filePath, function(err, fileContents){
        if(err && filesToInclude.length == 0 ) return deferred.resolve()
        var filePaths = getDistPaths(filePath);
        mkpath.sync( filePaths[0] );
        fs.writeFile( filePaths[1] , fileContents, function(err){
          if(err) return deferred.reject(err)
          if(filesToInclude.length == 0 ) return deferred.resolve()
        });
      })
    }
  });

  return deferred.promise;

}


function transformPath(filePath){
  var pathsToExclude = ["tmp", promptOptions.package.threevot.distFolder, "package.json", ".git", ".gitignore"] 
  pathsToExclude = pathsToExclude.concat( promptOptions.package.threevot.pathsToExclude || [] )

  for (var i = pathsToExclude.length - 1; i >= 0; i--) {
    var excludePath = pathsToExclude[i];
    excludePath = Path.join(tempVars.app_path, excludePath);
    if(filePath.indexOf( excludePath ) == 0){
      Log.debug("Excluding" + filePath + " because its in excludePath", "app/build", 87);
      return false;
    }
    var dirPath = filePath.substr(0, filePath.lastIndexOf("/") );
    if( dirPath == tempVars.app_path && Path.extname(filePath) == ".js" ){
      Log.debug("Excluding " + filePath + " because it is a JS in route", "app/build", 87);
      return false
    }
  };
  return true
}

module.exports = execute;