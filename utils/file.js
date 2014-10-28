var fs = require('fs');
var Q = require("q");
var Path = require('path');
var rimraf = require("rimraf");


function clearTMPFolder(){
  var deferred = Q.defer();
  var path = Path.join( process.cwd(), 'tmp' );
  rimraf(path, function(err){
    return deferred.resolve();
  })

  return deferred.promise;
}

module.exports = {
	clearTMPFolder: clearTMPFolder
}