# github-pivotal-sync

This app can be used to sync a Github repo with a Pivotal Tracker project.  It utilizes github webhooks and Pivotal REST API in order to communicate between systems.

## Installation

To develop and test locally, you must have Node installed.

Clone the Repo     
Run ```npm install```   
or if you are using yarn Run ```yarn```  
 
Once you have all the settings configured , to launch the app you can either type ``` npm start ```

### Configure settings

This app supports either setting enviromental variables or editing files found in /config/env/development.json  

```module.exports = {  
  github: {  
    apiToken:   "",
    repo: ""
  },
  bot: {
    "username": ""
  },
  pivotal: {
    "apiToken": "",
    "project": "",
    "baseUrl": 'https://www.pivotaltracker.com/services/v5/'
  },
  users: {
    user_list: [
      { "github": "test", "email": "test@test.com" }
    ]
  }
};
```
If you want environment variables set  
the following is an example of how the naming would work
```sails_github__ apiToken="abcdefg" ```


### Usage scenarios
If you create a new issue in GH it will automatically create the issue in Pivotal.  
If you add a comment on a github issue that is not in Pivotal , it will create the issue in Pivotal.  
If you add a label or assign a issue that is not in pivotal, it will create the issue in Pivotal.  

### Docker usage
This repo comes with a working DOCKERFILE and all you need to get it set up is run a docker build like below  
```docker build -t myDockerId/github-pivotal-sync .```  
```docker run -dt myDockerId/github-pivotal-sync ```  
 
If you would like to run this in a container and do not need to update the code base, please view the image at [https://hub.docker.com/r/chaleninja/github-pivotal-sync/](https://hub.docker.com/r/chaleninja/github-pivotal-sync/) 

### Testing the webhook
Since this uses a git webhook you need to be able to create one from your local box for testing.  My recommended approach is to install ngrok locally from http://ngrok.com and then run ```ngrok http 8080``` If you are running a different port than 8080 change it appropriately.  Take the URL it generates like http://f3170278.ngrok.io  and append **/webhook** to it .  Example - http://f3170278.ngrok.io/webhook.  Plug this in as a new webhook in your repo and you should be able to test it locally.  

### Monitoring 
If you would like to monitor to ensure the github sync service is listening, a built in endpoint of **http://myhostename.com/webook/test_hook**

## Logging
If you would like to get more verbose logging please set the environmental variable ```LOG_LEVEL``` to 'verbose'.  

## License

See [LICENSE.txt](LICENSE.txt)