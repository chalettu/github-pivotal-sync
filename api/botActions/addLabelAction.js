module.exports = {
    commandName: "add_label",
    action: function(request,args){
        
        var labels = args.split(/\s*,\s*/);
        var issueId = request.number;

        GithubService.addLabels(issueId, labels).then(function(result){
            sails.log.info("Successfully added github labels");
        });
       
    }

}