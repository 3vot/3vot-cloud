var Keen = require('keen.io');

var Q = require("q")

var Log = require("./log")

var user = {}

var client;
var product;

module.exports = {
  setup: setup,
  track: track
}

function setup(projectId, writeId, srcProduct){
  product = srcProduct
  client = Keen.configure({
    projectId: projectId,
    writeKey: writeId
  });

}


function track(name, event, options){
  var deferred = Q.defer();
  if(!event) event = {}
  delete event.public_dev_key
  delete event.private_dev_key
  delete event.db
  event.product = product;

  client.addEvent(name, event, function(err, res) {
    if(err) return deferred.reject(err);
    deferred.resolve(res);
  })
}
