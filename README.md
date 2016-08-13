# eventgallery-lambda
Amazon Lambda hosted image processor to calculate thumbnails from/to Amazon S3

# Local Test Setup

    npm install  -g lambda-local
    npm install

 Create a file .profile which contains your aws access credentials

 ```
 [default]
aws_access_key_id=xxx
aws_secret_access_key=yyyy
 ```

 Make sure you use Linux line endings only.

 # Local Test Execution

 simply run ```run.cmd``` to execute the lambda function using the event specified in the event sample data folder.
