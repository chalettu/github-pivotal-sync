var Q = require("q");
var rp = require('request-promise');
var pvConfig = sails.config.pivotal;

var pivotal = {
    init: function () {
        var authorized_users = sails.config.users.user_list;
       //FIRST LETS MAP OUT ALL AUTHORIZED USERS GITHUB => PIVOTAL USER ID'S
        pivotal.getPivotalUserList().then(function (pivotalUsers) {
            pivotalUsers.forEach(function (user) {
                var user_data = search(authorized_users, user.person.email, 'email');
                if (user_data != undefined) {
                    user_data.pivotal_id = user.person.id;
                    pivotal.users.push(user_data);
                }
            });
            sails.log.info('Successfully mapped ' + pivotal.users.length + ' github users');
        });
         //load up story type mappings
         var storyTypes=sails.config.storyTypes.mapping;
        storyTypes.forEach(function(storyType){
        if (storyType.default_story_type==='true'){
            pivotal.defaultStoryType=storyType;
        }
        else{
        pivotal.storyTypes.push(storyType);    
        }
    });
    },
    createIssue: function (issueData) {
        var deferred = Q.defer();
      /* var issueNumber = pivotal.extractPivotalTicketNumber(issueData.body);
        //if regex in body has a pivotal ticket 
        if (issueNumber == null) {
            GithubService.createComment(issueData.number,"Please be sure to provide a Pivotal Ticket ID as part of the PR description");
        }
        else{
            ///description += "\n\n ---- " + issueData.html_url;
           pivotal.getStoryDetails(issueNumber).then(function(pvIssueData){
            var description = pvIssueData.description;

            var matches = description.match(/----\shttps:\/\/github.com\//);
            if (matches === null){
                description += "\n\n ---- " + issueData.html_url;
                var updateData={
                    description: description,
                    "current_state": "finished", 
                };
                pivotal.updateTicket(issueNumber,updateData);
            }
           });
        }*/
        var description = issueData.body + "\n";
        description += "\n\n ---- " + issueData.html_url;

        var body = {
            "name": issueData.title,
            "description": description,
            "current_state": "started",
            "estimate": 0
        };

        var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/stories';
        var options = pivotal.buildRestRequest(url, body);
        rp(options)
            .then(function (parsedBody) {
                sails.log.info('Created Pivotal Ticket '+parsedBody.id);
                deferred.resolve(parsedBody);
            })
            .catch(function (err) {
                deferred.resolve(null);
                sails.log.error("create_pivotal_issue failed to create issue " + JSON.stringify(err));
            });
            return deferred.promise;
    },
    linkPivotalTicket: function (issueNumber, githubRequest) {

        pivotal.getStoryDetails(issueNumber).then(function (pvIssueData) {
            var description = pvIssueData.description;

            var matches = description.match(/----\shttps:\/\/github.com\//);
            if (matches === null) {
                description += "\n\n ---- " + githubRequest.html_url;
                var updateData = {
                    description: description,
                    "current_state": "finished",
                };
                pivotal.updateTicket(issueNumber, updateData);
            }

            githubRequest.labels.forEach(function (label) {
                pivotal.addPivotalLabel(githubRequest, label.name);
            });
            githubRequest.assignees.forEach(function (assignee) {
                pivotal.assignPivotalUser(githubRequest);
            });
        });
    },
    extractPivotalTicketNumber: function (text) {
        var matches = [];
        matches = text.match(/(https:\/\/www.pivotaltracker.com\/story\/show\/)(\d*)/);

        if (matches !== null) {
            return matches[2];
        }
        else {
            return null;
        }
    },
    closeIssue: function (issue_data) {

        //first figure out if it was merged or just closed
        pivotal.findPivotalIssue(issue_data.html_url).then(function (issue_number) {
            var project_id = parseInt(pvConfig.project);
            var body = {
                "current_state": 'delivered'
            };

            var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/stories/' + issue_number;
            var options = pivotal.buildRestRequest(url, body);
            options.method = "PUT";

            rp(options)
                .then(function (parsedBody) {
                    console.log(parsedBody);
                })
                .catch(function (err) {
                    // POST failed...
                    sails.log.error("close_pivotal_issue failed to close issue " + JSON.stringify(err));
                });
        });
    },
    buildRestRequest: function (url, body) {
        var options = {
            uri: url,
            method: 'POST',
            headers: {
                'X-TrackerToken': pvConfig.apiToken
            },
            body: body,
            json: true // Automatically stringifies the body to JSON
        };
        return options;
    },
    findPivotalIssue: function (githubIssue) {
        var deferred = Q.defer();

        var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/search';
        var body = {
            "query": githubIssue
        };

        var options = pivotal.buildRestRequest(url, body);
        options.method = "GET";

        rp(options)
            .then(function (parsedBody) {
                var stories = parsedBody.stories.stories;
                var issue_id = null;
                if (stories.length === 1) {
                    issue_id = stories[0].id;
                    deferred.resolve(issue_id);
                }
                else {
                    deferred.resolve(null);
                }
            })
            .catch(function (err) {
                deferred.reject("http error on trying to find pivotal ticket");
                sails.log.error('Unable to find ticket' + githubIssue + " " + JSON.stringify(err));
            });
        return deferred.promise;
    },
    addPivotalLabel: function (issue, label, retry_count) {
        var github_issue_url = issue.html_url;
        var story_type_obj = {};

        if (retry_count == null) {
            retry_count = 0;
        }
        else {
            pivotal.sleepFor(1500 * retry_count);
        }

        pivotal.findPivotalIssue(github_issue_url).then(function (issue_number) {
           
                sails.log.info("Label - " + label + ' to be added to pivotal issue ' + issue_number);
                story_type_obj = pivotal.getStoryType(label);
                if (story_type_obj == null) {//set story type to default story type
                    story_type_obj = pivotal.defaultStoryType;
                }
                // build one big object to update then update 
                var body = {
                    "story_type": story_type_obj.story_type
                };

                //this adds in estimate for tickets 
                pivotal.getStoryDetails(issue_number).then(function (issue_data) {
                    if (issue_data.estimate === 0 && story_type_obj.estimated_points > 0) {
                        //this is the use case that default estimate exists and the label type has a estimated point associated
                        //with it
                        body.estimate = story_type_obj.estimated_points;
                    }
                    pivotal.updateTicket(issue_number, body).then(function (data) {
                        sails.log.info("Pivotal Ticket story type and estimate updated for ticket  " + issue_number);
                    })
                });
                sails.log.info("Finding labels for issue " + issue_number, 'verbose');
                pivotal.getPivotalLabels(issue_number).then(function (labels) {
                    var existing_label = search(labels, label, 'name');
                    if (existing_label == undefined) { // lets add the label
                        var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/stories/' + issue_number + '/labels';
                        var body = {
                            "project_id": pvConfig.project,
                            "story_id": issue_number,
                            "name": label
                        };

                        var options = pivotal.buildRestRequest(url, body);
                        options.method = "POST";
                        rp(options)
                            .then(function (parsedBody) {
                                sails.log.info("Label (" + label + ") added successfully to ticket " + issue_number);
                            })
                            .catch(function (err) {
                                if (err.statusCode == 500 && retry_count < 10) {
                                    retry_count++;
                                    pivotal.addPivotalLabel(issue, label, retry_count);
                                }
                                else {
                                    sails.log.info("Failed to add labels to ticket - " + JSON.stringify(err));
                                }
                            });
                    }
                });
        }).catch(function (err) {
            retry_count++;
            if (retry_count < 8) {
                pivotal.addPivotalLabel(issue, label, retry_count);
            }
            else {
              //  pivotal.triggerIssueCreate(issue);
            }
        });
    },
    removePivotalLabels: function (github_issue_url, label, retry_count) {
        if (retry_count == null) {
            retry_count = 0;
        }
        else {
            pivotal.sleepFor(1000 * retry_count);
        }
        pivotal.findPivotalIssue(github_issue_url).then(function (issue_number) {
            pivotal.getPivotalLabels(issue_number).then(function (labels) {
              
                var existing_label = search(labels, label, 'name');
                ///projects/{project_id}/labels/{label_id}
                var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/labels/' + existing_label.id;
                var body = {};
                var story_type = null;
                var options = pivotal.buildRestRequest(url, body);
                options.method = "DELETE";
     
                if (labels.length == 1) {
                    //lets default the story type
                    story_type = pivotal.defaultStoryType;
                }
                else {
                    labels.forEach(function (pivotal_label) {
                        if (story_type != null || label == pivotal_label.name) {//So if another label matched a story type or if label matches the current label in the array, skip it
                            //don't do anything in this case
                        }
                        else {
                            story_type = pivotal.getStoryType(pivotal_label.name, 'story_type');
                        }
                    });
                    if (story_type == null) {
                        story_type = pivotal.defaultStoryType;
                    }
                }
                var request_obj = {
                    "story_type": story_type.story_type
                };
 
                pivotal.updateTicket(issue_number, request_obj);

                rp(options)
                    .then(function (parsedBody) {
                        sails.log.info("Label " + label + "(" + existing_label.id + " ) removed from ticket +" + github_issue_url);
                    })
                    .catch(function (err) {
                        // POST failed..
                        if (err.statusCode == 500 && retry_count < 5) {
                            retry_count++;
                            pivotal.removePivotalLabels(github_issue_url, label, retry_count);
                        }
                        else {
                            sails.log.error("remove_pivotal_labels failed to remove labels " + JSON.stringify(err));
                        }
                    });
            });
        });
    },
    getPivotalLabels: function (issue_number) {
        var deferred = Q.defer();

        var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/stories/' + issue_number + '/labels';
        var body = {};

        var options = pivotal.buildRestRequest(url, body);
        options.method = "GET";
        rp(options)
            .then(function (parsedBody) {
                var labels = [];
                parsedBody.forEach(function (label) {
                    labels.push({ "id": label.id, "name": label.name });
                });
                deferred.resolve(labels);
            })
            .catch(function (err) {
                sails.log.error("Failed to get labels for ticket " + JSON.stringify(err));
                deferred.reject("Search Error");
            });
        return deferred.promise;
    },
    getStoryDetails: function (issue_number) {
        var deferred = Q.defer();

        var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/stories/' + issue_number;
        var body = {};

        var options = pivotal.buildRestRequest(url, body);
        options.method = "GET";

        rp(options)
            .then(function (parsedBody) {

                deferred.resolve(parsedBody);
            })
            .catch(function (err) {
                sails.log.error("Failed to get pivotal ticket " + JSON.stringify(err));
                deferred.reject("Pivotal story detail Error");
            });
        return deferred.promise;
    },
    updateTicket: function (issue_number, data) {
        var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/stories/' + issue_number;
        var options = pivotal.buildRestRequest(url, data);
        options.method = "PUT";

        rp(options)
            .then(function (parsedBody) {
                sails.log.info("Updated pivotal ticket " + issue_number);
            })
            .catch(function (err) {
                sails.log.error("Failed to update pivotal ticket " + JSON.stringify(err));
            });
    },
    getPivotalUserList: function () {
        var deferred = Q.defer();

        var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/memberships';
        var body = {};

        var options = pivotal.buildRestRequest(url, body);
        options.method = "GET";

        rp(options)
            .then(function (parsedBody) {
                deferred.resolve(parsedBody);
            })
            .catch(function (err) {
                // POST failed...
                sails.log.error("get_pivotal_user_list failed to get users " + JSON.stringify(err));
            });
        return deferred.promise;
    },
    assignPivotalUser: function (issue, retry_count) {
        var github_user = issue.assignee.login;
        var github_issue_url = issue.html_url;

        if (retry_count == null) {
            retry_count = 0;
        }
        else {
            pivotal.sleepFor(1000 * retry_count);
        }

        pivotal.findPivotalIssue(github_issue_url).then(function (issue_number) {

            //look up user id
            var user_obj = search(pivotal.users, github_user, "github");

            if (user_obj != undefined) {
                var user_id = user_obj.pivotal_id
                var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/stories/' + issue_number + '/owners';
                var body = {
                    "project_id": pvConfig.project,
                    "story_id": issue_number,
                    "id": user_id
                };

                var options = pivotal.buildRestRequest(url, body);
                rp(options)
                    .then(function (parsedBody) {
                        sails.log.info("Assigned user " + user_id + " to ticket " + issue_number);
                    })
                    .catch(function (err) {
                        if (err.statusCode == 500 && retry_count < 8) {
                            retry_count++;
                            pivotal.assignPivotalUser(issue, retry_count)
                        }
                        else {

                            sails.log.error("pivotal.assignPivotalUser failed to assign user " + JSON.stringify(err));
                        }
                    })
            }
        }).catch(function (err) {
            if (retry_count < 8) {
                retry_count++;
                pivotal.assignPivotalUser(issue, retry_count)
            }
            else {
                //pivotal.triggerIssueCreate(issue);
            }
        });
    },
    removeAssignedPivotalUser: function (github_user, github_issue_url) {
        pivotal.findPivotalIssue(github_issue_url).then(function (issue_number) {
            var user_obj = search(pivotal.users, github_user, "github");
            var user_id = user_obj.pivotal_id
            var url = pvConfig.baseUrl + 'projects/' + pvConfig.project + '/stories/' + issue_number + '/owners/' + user_id;
            var body = {
            };

            var options = pivotal.buildRestRequest(url, body);
            options.method = "DELETE";

            rp(options)
                .then(function (parsedBody) {
                    sails.log.info("removed user from story ");
                })
                .catch(function (err) {
                    // POST failed...
                    sails.log.error("removed_assigned_pivotal_user failed to remove user " + JSON.stringify(err));
                })
        });
    },
    triggerIssueCreate: function (issue) {
       // create_pivotal_issue(issue);
       
        issue.labels.forEach(function (label) {
            add_pivotal_label(issue, label.name);
        });
        issue.assignees.forEach(function (assignee) {
            pivotal.assignPivotalUser(issue);
        });
    },
    manualIssueSync: function (issue_data) {
        var issue = issue_data;

        pivotal.findPivotalIssue(issue.html_url).then(function (data) {
            //issue doesnt exist, let's create it
            if (data == null) {
               // logMsg('Manual sync - About to trigger issue create', 'verbose');
                pivotal.triggerIssueCreate(issue);
            }
        }).catch(function (err) {

            sails.log.error("Tried searching for Pivotal Issue with gh url " + issue.html_url + " and the request had an error");
        });
    },
    getStoryType: function (label, label_field) {
        var story_type = null;
        if (label_field == null) {
            label_field = 'github_label';
        }
        pivotal.storyTypes.forEach(function (data) {
            if (data[label_field] === label.toLowerCase()) {
                story_type = data;
            }
        })
        return story_type;
    },
    sleepFor: function (sleepDuration) {
        var now = new Date().getTime();
        while (new Date().getTime() < now + sleepDuration) { /* do nothing */ }
    },
    users:[],
    storyTypes:[],
    defaultStoryType:{}
}
module.exports = pivotal;

pivotal.init();

function search(array, key, prop) {
    // Optional, but fallback to key['name'] if not selected
    prop = (typeof prop === 'undefined') ? 'name' : prop;

    for (var i = 0; i < array.length; i++) {
        if (array[i][prop] === key) {
            return array[i];
        }
    }
}