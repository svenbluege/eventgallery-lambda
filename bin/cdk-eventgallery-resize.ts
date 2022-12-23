#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {CdkEventgalleryImageResizeStack} from '../lib/cdk-stack';

const app = new cdk.App();
new CdkEventgalleryImageResizeStack(app, 'eventgallery-lambda-stack', {
  stackName: 'eventgallery-lambda-stack',
  env: {
    region: process.env.CDK_DEFAULT_REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  }
});
