var Path = require("path")
var Q = require("q");
var fs = require("fs")
var extend = require('util')._extend


function requireUncached(module){
  delete require.cache[ require.resolve(module) ]
  return require( module )
}

function _3vot(options){
  if(!options) options = {}
  var path= Path.join(process.cwd(), "3vot.json");
  var result;
  result = requireUncached( path  )
  
  result = extend(options, result )

  if(!result.paths) result.paths= { "sourceBucket": "source.3vot.com", "productionBucket": "3vot.com" }
  if(!result.uploadSource) result.uploadSource = true;

  return result;
}

function _3vot_save(fileContents){
  var deferred = Q.defer();

   var packagePath = Path.join(process.cwd(), "3vot.json")
   fs.writeFile( packagePath, JSON.stringify(fileContents, null, '\t') , function(err){ 
     if(err) return deferred.reject(err);
     deferred.resolve()
   });

   return deferred.promise;  
}

function _package(options){
  var path = Path.join( process.cwd(), "apps", promptOptions.app_name, "package.json" );
  var result =  requireUncached( path );
  if(options) return extend(options, result )
  return result;
}

module.exports = {
  requireUncached: requireUncached,
  _3vot: _3vot,
  _package: _package
}

_3vot.save = _3vot_save;