var http = require('http')
var createHandler = require('github-webhook-handler')
var Q = require("q");
const winston = require('winston');
var local_config = require("./conf/config.json");
var story_types_file = require("./conf/story_types.json");
var story_types=[],default_story_type="";
var local_authorized_users=require("./conf/users.json");
var config={};
var rp = require('request-promise');
var pivotal_base_url='https://www.pivotaltracker.com/services/v5/';
var authorized_users_file= require("./conf/users.json");
var users=[];
//this populates our user mapping
var authorized_users=[];
if (typeof (process.env.LOG_LEVEL) != 'undefined') {
 winston.level = process.env.LOG_LEVEL;
logMsg("Loaded Logging Level "+winston.level ,winston.level );
}
else{
    winston.level='info';
    logMsg("Loaded Logging Level - info");
}

function loadConfig() {
    if (typeof (process.env.USERS) != 'undefined') {
        authorized_users= JSON.parse(process.env.USERS);
    }
    else {
        authorized_users= authorized_users_file.user_list;
    } 
    //load up story type mappings
    story_types_file.story_types.forEach(function(story_type){
        if (story_type.default_story_type==='true'){
            default_story_type=story_type;
        }
        else{
        story_types.push(story_type);    
        }
    });
    logMsg("Story types "+JSON.stringify(story_types));
    if (typeof (process.env.API_TOKEN) != 'undefined') {
        console.log("Environment variables are defined and will be used");
        logMsg("Github Sync launched on port "+process.env.PORT);
        var env_variables={
            "port": process.env.PORT,
            "pivotal": {
                "project": process.env.PROJECT,
                "api_token": process.env.API_TOKEN
            },
            "secret":process.env.SECRET
        }; 
        logMsg("Loaded environ,env variables"+JSON.stringify(env_variables));  
        return env_variables;
    }
    else {
        return local_config;
    }
}
config=loadConfig();
var handler = createHandler({ path: '/webhook', secret: config.secret })
get_pivotal_user_list().then(function(pivotal_users){
    pivotal_users.forEach(function (user) {
        var user_data = search(authorized_users, user.person.email, 'email');
        if (user_data != undefined){
            user_data.pivotal_id=user.person.id;
            users.push(user_data);
        }
    });
    logMsg(user_data,'verbose');
    //console.log(users);
});

logMsg("Server Started and is listening on port "+config.port);
http.createServer(function (req, res) {
  
  handler(req, res, function (err) {
      if (req.url == '/webhook/test_hook') {
          res.statusCode = 200;
          res.end('Service is listening');
      }
      else {
          res.statusCode = 404
          res.end('no such location')
      }
  })
}).listen(config.port)
 
handler.on('error', function (err) {
    logMsg("Handler experienced an error "+err.message);
});

handler.on('issue_comment',function(event){
    var request=event.payload;

    if (typeof request.pull_request === undefined) {
        logMsg("Someone commented on a issue not a PR, time to sync issue ",'verbose');
        manual_issue_sync(request);
    }
    else{
        //console.log("this is a pr");
    }
});

handler.on('issues', function (event) {
    
    var issue_data=event.payload;
    logMsg('Issue Event occured - Event action is '+issue_data.action);
    switch (issue_data.action) {
        case 'labeled':
            add_pivotal_label(issue_data.issue, issue_data.label.name);
            break;
        case 'unlabeled':
            remove_pivotal_labels(issue_data.issue.html_url, issue_data.label.name);
            break;
        case 'assigned':
            assign_pivotal_user(issue_data.issue);
            break;
        case 'unassigned':
            var assignee = issue_data.assignee.login;
            removed_assigned_pivotal_user(assignee, issue_data.issue.html_url);
            break;
        case "opened":
            create_pivotal_issue(issue_data.issue);
            break;
         case "closed":
            close_pivotal_issue(issue_data.issue);
            break;
    }
});
function manual_issue_sync(issue_data) {
    var issue = issue_data.issue;

    find_pivotal_issue(issue.html_url).then(function (data) {
            //issue doesnt exist, let's create it
            if (data == null){
                      logMsg('Manual sync - About to trigger issue create', 'verbose');
            trigger_issue_create(issue);
            }
    }).catch(function (err) {
        
            logMsg("Tried searching for Pivotal Issue with gh url " + issue.html_url + " and the request had an error");
    });
}
function create_pivotal_issue(issue_data){
    var description=issue_data.body+"\n";
    description+="Linked Github Issue - " + issue_data.html_url;
    
    var body = {
        "name": issue_data.title,
        "description":description,
        "current_state":"started",
        "estimate":0
    };
   
    var url=pivotal_base_url+'projects/'+config.pivotal.project+'/stories';
    var options = build_pivotal_rest_request(url,body);

    rp(options)
        .then(function (parsedBody) {
            console.log(parsedBody);
        })
        .catch(function (err) {
            // POST failed...
            logMsg("create_pivotal_issue failed to create issue "+JSON.stringify(err));
        });
}
function close_pivotal_issue(issue_data) {

    find_pivotal_issue(issue_data.html_url).then(function (issue_number) {
        var project_id=parseInt(config.pivotal.project);
        var body = {
            "current_state": 'accepted'
        };

        var url = pivotal_base_url + 'projects/' + config.pivotal.project + '/stories/'+issue_number;
        var options = build_pivotal_rest_request(url, body);
        options.method="PUT";
       
        rp(options)
            .then(function (parsedBody) {
                console.log(parsedBody);
            })
            .catch(function (err) {
                // POST failed...
                logMsg("close_pivotal_issue failed to close issue "+JSON.stringify(err));
            });
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
           logMsg("get_pivotal_user_list failed to get users "+JSON.stringify(err));
        });
    return deferred.promise;
}

function add_pivotal_label(issue, label,retry_count) {
    
    var github_issue_url=issue.html_url;
    var story_type_obj={};

    if (retry_count == null) {
        retry_count = 0;
    }
    else{
        sleepFor(1500* retry_count);
    }
    
    find_pivotal_issue(github_issue_url).then(function (issue_number) {
        logMsg("Label - "+label+' to be added to pivotal issue '+issue_number);
         story_type_obj = get_story_type(label);
         if (story_type_obj== null){//set story type to default story type
             story_type_obj=default_story_type;
         }
       // build one big object to update then update 
         var body = {
             "story_type": story_type_obj.story_type
         };

          //this adds in estimate for tickets 
          get_pivotal_story_details(issue_number).then(function (issue_data) {
              if (issue_data.estimate === 0 && story_type_obj.estimated_points > 0) {
                  //this is the use case that default estimate exists and the label type has a estimated point associated
                  //with it
                  body.estimate = story_type_obj.estimated_points;
              }
              update_pivotal_ticket(issue_number, body).then(function (data) {
                  logMsg("Pivotal Ticket story type and estimate updated for ticket  " + issue_number);
              })
          });    
        logMsg("Finding labels for issue "+issue_number,'verbose');
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
                        logMsg("Label (" + label + ") added successfully to ticket " + issue_number);
                    })
                    .catch(function (err) {
                        if (err.statusCode == 500 && retry_count < 10) {
                            retry_count++;
                            add_pivotal_label(issue, label, retry_count);
                        }
                        else {
                          logMsg("Failed to add labels to ticket - "+JSON.stringify(err));
                        }
                    });
            }
        });
    }).catch(function (err) {
            retry_count++;
            if (retry_count < 8){
                add_pivotal_label(issue, label, retry_count);
            }
            else{          
                trigger_issue_create(issue);
            }
        });
}
function trigger_issue_create(issue) {
    create_pivotal_issue(issue);
    issue.labels.forEach(function (label) {
        add_pivotal_label(issue, label.name);
    });
    issue.assignees.forEach(function (assignee) {
        assign_pivotal_user(issue);
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
           var labels=[];
           parsedBody.forEach(function(label){
               labels.push({"id":label.id,"name":label.name});
           });
            deferred.resolve(labels);
        })
        .catch(function (err) {
            logMsg("Failed to get labels for ticket "+JSON.stringify(err));
            deferred.reject("Search Error");
        });
    return deferred.promise;
}
function get_pivotal_story_details(issue_number){
    var deferred = Q.defer();

    var url=pivotal_base_url+'projects/'+config.pivotal.project+'/stories/'+issue_number;
    var body={};

    var options=build_pivotal_rest_request(url,body);
    options.method="GET";

    rp(options)
        .then(function (parsedBody) {
           
            deferred.resolve(parsedBody);
        })
        .catch(function (err) {
            logMsg("Failed to get pivotal ticket "+JSON.stringify(err));
            deferred.reject("Pivotal story detail Error");
        });
    return deferred.promise;
}

function update_pivotal_ticket(issue_number, data) {
    var url = pivotal_base_url + 'projects/' + config.pivotal.project + '/stories/' + issue_number;
    var options = build_pivotal_rest_request(url, data);
    options.method = "PUT";

    rp(options)
        .then(function (parsedBody) {
            logMsg("Updated pivotal ticket " + issue_number);
        })
        .catch(function (err) {
            logMsg("Failed to update pivotal ticket " + JSON.stringify(err));
        });
}

function get_story_type(label,label_field){
    var story_type=null;
    if (label_field==null){
        label_field='github_label';
    }
    story_types.forEach(function(data){
        if (data[label_field] === label.toLowerCase()){
            story_type=data;
        }
    })
    return story_type;
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
            var story_type=null;
            var options = build_pivotal_rest_request(url, body);
            options.method = "DELETE";
            
            if (labels.length == 1){
                //lets default the story type
                story_type=default_story_type;
            }
            else{
                labels.forEach(function (pivotal_label){                    
                    if(story_type !=null || label == pivotal_label.name){//So if another label matched a story type or if label matches the current label in the array, skip it
                        //don't do anything in this case
                    }
                    else{
                       story_type=get_story_type(pivotal_label.name,'story_type');
                    }
                });
                if (story_type==null){
                    story_type=default_story_type;
                }  
            }
            var request_obj = {
                "story_type": story_type.story_type
            };
            update_pivotal_ticket(issue_number, request_obj).then(function (data) {
                logMsg("Pivotal Ticket story type updated for ticket  " + issue_number);
            });

            rp(options)
                .then(function (parsedBody) {
                  logMsg("Label "+label+"("+existing_label.id+" ) removed from ticket +"+github_issue_url);
                })
                .catch(function (err) {
                    // POST failed..
                    if (err.statusCode== 500 && retry_count < 5 ){
                        retry_count++;
                        remove_pivotal_labels(github_issue_url, label,retry_count);
                    }
                    else{
                        logMsg("remove_pivotal_labels failed to remove labels "+JSON.stringify(err));
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
                deferred.resolve(issue_id);
            }
            else{
               deferred.resolve(null);
            }
        })
        .catch(function (err) {
            deferred.reject("http error on trying to find pivotal ticket");
            logMsg('Unable to find ticket'+ github_issue+" "+JSON.stringify(err));
        });
    return deferred.promise;
}
function assign_pivotal_user(issue,retry_count) {

var github_user = issue.assignee.login;
var github_issue_url=issue.html_url;

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
                    logMsg("Assigned user "+user_id +" to ticket "+issue_number);
                })
                .catch(function (err) {
                    if (err.statusCode == 500 && retry_count < 8) {
                        retry_count++;
                        assign_pivotal_user(issue, retry_count)
                    }
                    else {
                       
                        logMsg("assign_pivotal_user failed to assign user "+JSON.stringify(err));
                    }
                })
        }
    }).catch(function (err) {
        if (retry_count < 8) {
            retry_count++;
            assign_pivotal_user(issue, retry_count)
        }
        else{
             trigger_issue_create(issue);
        }
    });
}
function removed_assigned_pivotal_user(github_user, github_issue_url) {
    find_pivotal_issue(github_issue_url).then(function (issue_number) {
        var user_obj = search(users, github_user, "github");
        var user_id = user_obj.pivotal_id
        var url = pivotal_base_url + 'projects/' + config.pivotal.project + '/stories/' + issue_number + '/owners/' + user_id;
        var body = {
        };

        var options = build_pivotal_rest_request(url, body);
        options.method = "DELETE";

        rp(options)
            .then(function (parsedBody) {
                logMsg("removed user from story ");
            })
            .catch(function (err) {
                // POST failed...
                logMsg("removed_assigned_pivotal_user failed to remove user "+JSON.stringify(err));
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
    logMsg("Sleeping for "+sleepDuration);
    var now = new Date().getTime();
    while(new Date().getTime() < now + sleepDuration){ /* do nothing */ } 
}
function logMsg(message,level){
    
    if (level==null){
        level='info';
    }
    winston.log(level, message);
}
