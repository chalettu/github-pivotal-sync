var http = require('http')
var createHandler = require('github-webhook-handler')
var handler = createHandler({ path: '/webhook', secret: 'blah' })
var config = require("./conf/config.json");
var rp = require('request-promise');
var pivotal_base_url='https://www.pivotaltracker.com/services/v5/';

console.log("Server Started and is listening on port "+config.port);
http.createServer(function (req, res) {
  
  handler(req, res, function (err) {
    res.statusCode = 404
    res.end('no such location')
  })
}).listen(config.port)
 
handler.on('error', function (err) {
  console.error('Error:', err.message)
})
 
handler.on('push', function (event) {
  console.log('Received a push event for %s to %s',
    event.payload.repository.name,
    event.payload.ref)
})
 
handler.on('issues', function (event) {

    var description=event.payload.issue.body+"\n";
    description+="Linked Github Issue - " + event.payload.issue.html_url;

    if (event.payload.action ==='opened'){  
    var body = {
        "name": event.payload.issue.title,
        "description":description
    };

    var url=pivotal_base_url+'projects/'+config.pivotal.project+'/stories';
    var options = build_pivotal_rest_request(url,body);
    console.log(options);
    
    rp(options)
        .then(function (parsedBody) {
            console.log(parsedBody);
        })
        .catch(function (err) {
            // POST failed...
            console.log(err)
        });
    }
})
function build_pivotal_rest_request(url, body) {
    var options = {
        uri: url,
        method: 'POST',
        headers: {
            'X-TrackerToken': config.pivotal.api_token
        },
        body: body,
        json: true // Automatically stringifies the body to JSON
    };
    return options;
}