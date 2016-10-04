# github-pivotal-sync

Environmental Variables to set

config.json
```
{
    "port": "7777",
    "pivotal": {
        "api_token": "1234",
        "project": "1234"
    },
    "secret":"blah"
}
```
If you want environment variables set
PORT -> port number to run the webhook  
API_TOKEN -> Pivotal API Token
PROJECT -> Pivotal Project ID
SECRET -> Github webhook secret

docker build -t chaleninja/github-pivotal-sync .