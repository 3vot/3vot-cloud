
var fs = require("fs");
var Browserify = require("browserify");
var Q = require("q");
var Path = require('path');
var eco = require("eco")

var WalkDir = require("./walk")
var Log = require("./log")


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
//  buildDependency: buildDependency,
  buildHtml: buildHtml,
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
  options.entry_path   =  Path.join( options.app_path );
  options.view_path    =  Path.join( options.entry_path, "views");
  
  options.package = require( options.package_path ) 

  Q.all( _createBundlesPromises() )
  .then( _build3VOTJS )
  .then( buildHtml )
  .then(  deferred.resolve )
  .fail( deferred.reject );
    
  return deferred.promise;
}

function _build3VOTJS(){
  var deferred = Q.defer();
  var filename = "3vot.js"
  
  saveFile(options.entry_path, filename, 'require("3vot")( require("./package") )' ) 
  //.then( function(){ return _bundleEntry(filename, options.dist_path, "uglifyify"); } )
  .then( deferred.resolve )
  .fail( deferred.reject );
  return deferred.promise;
}

//Build and saves the HTML Main file
function buildHtml(){
  var deferred = Q.defer();
  var indexDestPath = Path.join( options.dist_path, "index.html" );

  var htmlTemplate = fs.readFileSync( Path.join( process.cwd(), "apps", options.app_name , "index.html" ), "utf-8" )
  var html = eco.render(htmlTemplate, options );

  fs.writeFile( indexDestPath, html, function(err){
    if(err) return deferred.reject(err);
    deferred.resolve(html);
  });

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

function _createBundlesPromises(){
 var bundlePromises = [];
  var files = fs.readdirSync(options.entry_path);

  for (var i = files.length - 1; i >= 0; i--) {
    var file_name = files[i];
    var file_with_path = Path.join( options.entry_path , file_name );
    var stat = fs.statSync(file_with_path)

    if (!stat.isDirectory() && Path.extname(file_with_path) === ".js"){ 
      bundlePromises.push( _bundleEntry( file_name ) );
    }
  }
  return bundlePromises;
}

function _bundleEntry(entryName, path, avoidTransform){
  var deferred = Q.defer();
  var _this = this;

  var entryWithPath = Path.join( path || options.entry_path, entryName)

  var b = Browserify( entryWithPath , {
    extensions: options.package.threevot.extensions
  });

  _ref = options.package.threevot.transforms;
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    transform = _ref[_i];   
    if(transform !== avoidTransform) b.transform(transform);
  }

  for (key in options.package.threevot.external) {
    dep = options.package.threevot.external[key];
    b.external(dep);
  }

  b.bundle( {}, 
    function(err, src) {
      if (err) return deferred.reject(err)
      saveFile( options.dist_path, entryName , src )
      .then( function(){ deferred.resolve( src ) }  )
      .fail( function(saveError){ deferred.reject(saveError);  }  )
    }
  );
  return deferred.promise;
}
