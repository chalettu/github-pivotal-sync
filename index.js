var http = require('http')
var createHandler = require('github-webhook-handler')
var Q = require("q");
var handler = createHandler({ path: '/webhook', secret: 'blah' })
var local_config = require("./conf/config.json");
var config={};
var rp = require('request-promise');
var pivotal_base_url='https://www.pivotaltracker.com/services/v5/';
var authorized_users_file= require("./conf/users.json");
var users=[];
//this populates our user mapping
var authorized_users=authorized_users_file.user_list;

function loadConfig() {

    if (typeof (process.env.API_TOKEN) != 'undefined') {
        console.log("API is defined");
        return {
            "port": process.env.PORT,
            "pivotal": {
                "project": process.env.PROJECT,
                "api_token": process.env.API_TOKEN
            }
        };
         
    }
    else {
        return local_config;
    }
}
config=loadConfig();

get_pivotal_user_list().then(function(pivotal_users){
    pivotal_users.forEach(function (user) {
        var user_data = search(authorized_users, user.person.email, 'email');
        if (user_data != undefined){
            user_data.pivotal_id=user.person.id;
            users.push(user_data);
        }
    });
    //console.log(users);
});


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
   // console.log(event.payload);
    
    var issue_data=event.payload;

    switch (issue_data.action) {
        case 'labeled':
            add_pivotal_label(issue_data.issue.html_url, issue_data.label.name);
            break;
        case 'unlabeled':
            remove_pivotal_labels(issue_data.issue.html_url, issue_data.label.name);
            break;
        case 'assigned':
            //  assignee
            var assignee = issue_data.assignee.login;
            assign_pivotal_user(assignee, issue_data.issue.html_url);
            break;
        case 'unassigned':
            var assignee = issue_data.assignee.login;
            removed_assigned_pivotal_user(assignee, issue_data.issue.html_url);
            break;
        case "opened":
            create_pivotal_issue(issue_data);
            break;
    }
});

function create_pivotal_issue(issue_data){
    var description=issue_data.body+"\n";
    description+="Linked Github Issue - " + issue_data.html_url;
    
    var body = {
        "name": issue_data.title,
        "description":description
    };
   
    var url=pivotal_base_url+'projects/'+config.pivotal.project+'/stories';
    var options = build_pivotal_rest_request(url,body);

    rp(options)
        .then(function (parsedBody) {
            console.log(parsedBody);
        })
        .catch(function (err) {
            // POST failed...
            console.log(err)
        });
}
function get_pivotal_user_list() {
    var deferred = Q.defer();

    var url = pivotal_base_url + 'projects/' + config.pivotal.project + '/memberships';
    var body = {};

    var options = build_pivotal_rest_request(url, body);
    options.method = "GET";

    rp(options)
        .then(function (parsedBody) {
           
            deferred.resolve(parsedBody);
        })
        .catch(function (err) {
            // POST failed...
            console.log(err)
        });
    return deferred.promise;
}

function add_pivotal_label(github_issue_url, label,retry_count) {
    console.log("Lablel to be added " + label);
   
    if (retry_count == null) {
        retry_count = 0;
    }
    else{
        sleepFor(1000* retry_count);
    }
    find_pivotal_issue(github_issue_url).then(function (issue_number) {
        console.log("Finding labels for issue "+issue_number);
        get_pivotal_labels(issue_number).then(function (labels) {
            var existing_label = search(labels, label, 'name');
            if (existing_label == undefined) { // lets add the label
                var url = pivotal_base_url + 'projects/' + config.pivotal.project + '/stories/' + issue_number + '/labels';
                var body = {
                    "project_id": config.pivotal.project,
                    "story_id": issue_number,
                    "name": label
                };
                
                var options = build_pivotal_rest_request(url, body);
                options.method = "POST";
                rp(options)
                    .then(function (parsedBody) {
                        console.log("Label (" + label + ") added successfully to ticket " + issue_number);
                    })
                    .catch(function (err) {
                        if (err.statusCode == 500 && retry_count < 5) {
                            retry_count++;
                            add_pivotal_label(github_issue_url, label, retry_count);
                        }
                        else {
                            console.log(err)
                        }
                    });
            }
        });
    });
}
function get_pivotal_labels(issue_number){
    var deferred = Q.defer();

    var url=pivotal_base_url+'projects/'+config.pivotal.project+'/stories/'+issue_number+'/labels';
    var body={};

    var options=build_pivotal_rest_request(url,body);
    options.method="GET";
    
    rp(options)
        .then(function (parsedBody) {
           // console.log(JSON.stringify(parsedBody));
           var labels=[];
           parsedBody.forEach(function(label){
               labels.push({"id":label.id,"name":label.name});
           });
            deferred.resolve(labels);
        })
        .catch(function (err) {
            // POST failed...
            console.log(err)
        });
    return deferred.promise;




}
function remove_pivotal_labels(github_issue_url, label,retry_count) {
    if (retry_count==null){
        retry_count=0;
    }
    else{
        sleepFor(1000* retry_count);
    }
    find_pivotal_issue(github_issue_url).then(function (issue_number) {
        get_pivotal_labels(issue_number).then(function (labels) {

            var existing_label = search(labels, label, 'name');
            ///projects/{project_id}/labels/{label_id}
            var url = pivotal_base_url + 'projects/' + config.pivotal.project + '/labels/' + existing_label.id;
            var body = {};

            var options = build_pivotal_rest_request(url, body);
            options.method = "DELETE";
           
            rp(options)
                .then(function (parsedBody) {
                  console.log("Label "+label+"("+existing_label.id+" ) removed from ticket +"+github_issue_url);
                })
                .catch(function (err) {
                    // POST failed..
                    if (err.statusCode== 500 && retry_count < 5 ){
                        retry_count++;
                        remove_pivotal_labels(github_issue_url, label,retry_count);
                    }
                    else{
                        console.log(err)
                    }
                });
        });
    });
}
function find_pivotal_issue(github_issue){
    var deferred = Q.defer();

    var url=pivotal_base_url+'projects/'+config.pivotal.project+'/search';
    var body={"query":github_issue};

    var options=build_pivotal_rest_request(url,body);
    options.method="GET";

    rp(options)
        .then(function (parsedBody) {
           // console.log(JSON.stringify(parsedBody));
            var stories=parsedBody.stories.stories;
            var issue_id=null;
            if (stories.length ===1){
                issue_id=stories[0].id;
            }
            deferred.resolve(issue_id);
        })
        .catch(function (err) {
            // POST failed...
            console.log(err)
        });
    return deferred.promise;
}
function assign_pivotal_user(github_user, github_issue_url, retry_count) {

    if (retry_count == null) {
        retry_count = 0;
    }
    else {
        sleepFor(1000 * retry_count);
    }

    find_pivotal_issue(github_issue_url).then(function (issue_number) {

        //look up user id
        var user_obj = search(users, github_user, "github");

        if (user_obj != undefined) {
            var user_id = user_obj.pivotal_id
            var url = pivotal_base_url + 'projects/' + config.pivotal.project + '/stories/' + issue_number + '/owners';
            var body = {
                "project_id": config.pivotal.project,
                "story_id": issue_number,
                "id": user_id
            };

            var options = build_pivotal_rest_request(url, body);

            rp(options)
                .then(function (parsedBody) {
                    console.log("Assigned user to ticket");
                })
                .catch(function (err) {
                    if (err.statusCode == 500 && retry_count < 5) {
                        retry_count++;
                        assign_pivotal_user(github_user, github_issue_url, retry_count)
                    }
                    else {
                        console.log(err)
                    }
                })
        }
    })
}
function removed_assigned_pivotal_user(github_user, github_issue_url) {
    find_pivotal_issue(github_issue_url).then(function (issue_number) {

        //look up user id
        var user_obj = search(users, github_user, "github");
        var user_id = user_obj.pivotal_id
        var url = pivotal_base_url + 'projects/' + config.pivotal.project + '/stories/' + issue_number + '/owners/' + user_id;
        var body = {
        };

        var options = build_pivotal_rest_request(url, body);
        options.method = "DELETE";

        rp(options)
            .then(function (parsedBody) {
                console.log("removed user from story ");
            })
            .catch(function (err) {
                // POST failed...
                console.log(err)
            })
    });
}
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
function search(array, key, prop){
    // Optional, but fallback to key['name'] if not selected
    prop = (typeof prop === 'undefined') ? 'name' : prop;    

    for (var i=0; i < array.length; i++) {
        if (array[i][prop] === key) {
            return array[i];
        }
    }
}
function sleepFor( sleepDuration ){
    console.log("Sleeping for "+sleepDuration);
    var now = new Date().getTime();
    while(new Date().getTime() < now + sleepDuration){ /* do nothing */ } 
}