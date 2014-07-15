
var fs = require("fs");
var Browserify = require("browserify");
var Q = require("q");
var Path = require('path');
var eco = require("eco")

var WalkDir = require("./walk")
var Log = require("./log")
var rimraf =require("rimraf")

var options = {
  app_name: null,
  user_name: null,
  folder_name: null,
  entry_path: null,
  view_path: null,
  package_path: null,
  package: null,
  serverTag: null
}

module.exports = {
  buildApp: buildApp,
  saveFile: saveFile
}

// Builds the App using Browserify using Transformations and excluding external dependencies.
function buildApp(app_name, user_name){
  var deferred = Q.defer();
  
  options.app_name     =  app_name;
  options.user_name    =  user_name;
  options.app_path     =  Path.join( process.cwd(), "apps", options.app_name);
  options.temp_path    =  Path.join( process.cwd(), "tmp");
  options.serverTag    = "{3vot}";

  options.package_path =  Path.join( options.app_path,   "package.json" );
  options.dist_path    =  Path.join( options.app_path,   "app");
  options.entry_path   =  options.app_path;
  options.view_path    =  Path.join( options.entry_path, "views");
  
  options.package = require( options.package_path ) 

  Q.all( createBundlesPromises() )
  .then( build3VOTJS )
  .then( delete3VOTJS )
  .then( deferred.resolve )
  .fail( deferred.reject );
    
  return deferred.promise;
}

function createBundlesPromises(){
 var bundlePromises = [];
  var files = fs.readdirSync(options.entry_path);

  for (var i = files.length - 1; i >= 0; i--) {
    var file_name = files[i];
    var file_with_path = Path.join( options.entry_path , file_name );
    var stat = fs.statSync(file_with_path)

    if (!stat.isDirectory() && Path.extname(file_with_path) === ".js"){ 
      bundlePromises.push( bundleEntry( file_name ) );
    }
  }
  return bundlePromises;
}


function build3VOTJS(){
  var deferred = Q.defer();
  var filename = "3vot.js"
  saveFile(options.entry_path, filename, 'require("3vot")( require("./package") )' ) 
  .then( deferred.resolve )
  .fail( deferred.reject );
  return deferred.promise;
}


function bundleEntry(entryName, path){
  var deferred = Q.defer();
  var _this = this;

  var entryWithPath = Path.join( path || options.entry_path, entryName)

  var b = Browserify( entryWithPath , {
    extensions: options.package.threevot.extensions
  });

  _ref = options.package.threevot.transforms;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    transform = _ref[_i];   
    b.transform(transform);
  }

  for (key in options.package.threevot.external) {
    dep = options.package.threevot.external[key];
    b.external(dep);
  }

  b.bundle( {}, 
    function(err, src) {
      //if (err && entryName == "3vot.js") return deferred.resolve();  //ignores 3vot.js not found
      if (err) return deferred.reject(err)
      saveFile( options.dist_path, entryName , src )
      .then( function(){ deferred.resolve( src ) }  )
      .fail( function(saveError){ deferred.reject(saveError);  }  )
    }
  );
  return deferred.promise;
}

// Desc: Saves a File to System
function saveFile(path, filename, contents ){
  var deferred = Q.defer();

  fs.mkdir(path, function(){
    fs.writeFile(  Path.join(path, filename) , contents, 
      function(err){
        if(err) return deferred.reject(err);
        return deferred.resolve();
      }
    )
  });
  return deferred.promise;
}

function delete3VOTJS(){
  var deferred = Q.defer();
  var filename = "3vot.js"
  var filePath  = Path.join(options.entry_path, filename);
  fs.stat(filePath, function(err, stat){
    if(err) return deferred.reject(err);
    if(stat.isFile()) fs.unlinkSync(filePath);
    return deferred.resolve()
  });

  return deferred.promise;
}
