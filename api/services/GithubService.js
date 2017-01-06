var githubAPI = require('octonode');
var Q = require("q");

var github = {
    client: {},
    init: function () {
        github.client = githubAPI.client(sails.config.github.apiToken);
    },
    getPR: function (issueId) {
        var issue = github.client.issue(sails.config.github.repo, issueId);
        return issue;
    },
    createComment: function (issueId, comment) {
        var deferred = Q.defer();
        var issue = github.getPR(issueId);
        issue.createComment({
            body: comment
        }, function(data){
            deferred.resolve("Created");
        })
        return deferred.promise;
    },
    addLabels: function (issueId, labels) {
        var deferred = Q.defer();
        var issue = github.client.issue(sails.config.github.repo, issueId);
        
        issue.addLabels(labels,function(data){
            deferred.resolve("Created");
        })

        return deferred.promise;
    }
}

module.exports = github;
github.init();