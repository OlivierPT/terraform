import * as path from "path";
import { Construct } from "constructs";
import { App, TerraformStack, TerraformAsset, AssetType, TerraformOutput } from "cdktf";

import * as aws from '@cdktf/provider-aws';

const lambdaRolePolicy = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}

class LambdaStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    const provider = new aws.AwsProvider(this, "provider", {
      region: "eu-west-1",
    });

    const dataCallerIdentity = new aws.datasources.DataAwsCallerIdentity(this, 'caller-identity')

    // Create unique S3 bucket that hosts deployment assets
    const bucket = new aws.s3.S3Bucket(this, "bucket", {
      bucket: `s3-deployments-${dataCallerIdentity.accountId}-${provider.region}`,

    });

    // Create Lambda executable
    const helloLambdaAsset = new TerraformAsset(this, "hello-lambda-asset", {
      path: path.resolve(__dirname, '../../lambdas/hello/hello-lambda_1.0.0.zip'),
      type: AssetType.FILE, // if left empty it infers directory and file
    });


    // Upload Lambda zip file to newly created S3 bucket
    const lambdaArchive = new aws.s3.S3BucketObject(this, "hello-lambda-archive", {
      bucket: bucket.bucket,
      key: `lambdas/${new Date().getTime()}/${helloLambdaAsset.fileName}`,
      source: helloLambdaAsset.path, // returns a posix path
    });

    // Create Lambda role
    const lambdaRole = new aws.iam.IamRole(this, "lambda-role", {
      name: `role-hello-lambda`,
      assumeRolePolicy: JSON.stringify(lambdaRolePolicy)
    })

    // Add execution role for lambda to write to CloudWatch logs
    new aws.iam.IamRolePolicyAttachment(this, "lambda-managed-policy", {
      policyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      role: lambdaRole.name
    })

    // Create Lambda function
    const lambdaFunc = new aws.lambdafunction.LambdaFunction(this, "function-hello", {
      functionName: `lambda-hello`,
      s3Bucket: bucket.bucket,
      s3Key: lambdaArchive.key,
      handler: 'index.handler',
      runtime: 'nodejs14.x',
      role: lambdaRole.arn
    });

    // Create and configure API gateway
    const api = new aws.apigatewayv2.Apigatewayv2Api(this, "api-gw", {
      name: name,
      protocolType: "HTTP",
      target: lambdaFunc.arn
    })

    new aws.lambdafunction.LambdaPermission(this, "apigw-lambda", {
      functionName: lambdaFunc.functionName,
      action: "lambda:InvokeFunction",
      principal: "apigateway.amazonaws.com",
      sourceArn: `${api.executionArn}/*/*`,
    })

    new TerraformOutput(this, 'url', {
      value: api.apiEndpoint
    });

  }
}

const app = new App();

new LambdaStack(app, 'lambda-hello-world');

app.synth();
