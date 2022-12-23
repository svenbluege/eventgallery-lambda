import * as cdk from 'aws-cdk-lib';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import {RetentionDays} from "aws-cdk-lib/aws-logs";

export class CdkEventgalleryImageResizeStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);


        const imagemagickLayer = new lambda.LayerVersion(this, 'imagemagickLayer', {
            compatibleRuntimes: [
                lambda.Runtime.NODEJS_18_X
            ],
            code: lambda.Code.fromDockerBuild(path.join(__dirname, '/../src/layers/imagemagick')),
            description: 'A layer with the image magic binaries',
        });

        const resizeFunction = new NodejsFunction(this, 'resize', {
            memorySize: 1024,
            timeout: cdk.Duration.seconds(60),
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'main',
            entry: path.join(__dirname, `/../src/resize/index.ts`),
            logRetention: RetentionDays.FIVE_DAYS,
            layers: [imagemagickLayer],
            bundling: {
                minify: false,
                externalModules: ['aws-sdk'],
                sourceMap: true,
                target: 'es2021',
                environment: {
                    NODE_OPTIONS: '--enable-source-maps',
                }
            },
        });

        const api = new apigateway.RestApi(this, 'resize-api', {
            description: 'Eventgallery Resize api gateway',
            deployOptions: {
                stageName: 'prod',
            }
        });

        // 👇 create an Output for the API URL
        new cdk.CfnOutput(this, 'apiUrl', {value: api.url + 'resize'});

        const resize = api.root.addResource('resize');
        resize.addMethod(
            'POST',
            new apigateway.LambdaIntegration(resizeFunction, {proxy: true})
        )

    }
}
