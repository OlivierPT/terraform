import { Construct } from "constructs";
import { App, TerraformStack } from "cdktf";

import * as aws from '@cdktf/provider-aws';

class BootstrapStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    const provider = new aws.AwsProvider(this, "provider", {
      region: "eu-west-1",

    });

    const dataCallerIdentity = new aws.datasources.DataAwsCallerIdentity(this, 'caller-identity')

    // Create unique S3 bucket that hosts deployment assets
    new aws.s3.S3Bucket(this, "bucket", {
      bucket: `s3-deployments-${dataCallerIdentity.accountId}-${provider.region}`,
      versioning: {
        enabled: true,
      }
    });

    new aws.dynamodb.DynamodbTable(this, "table", {
      name: 'tf-state-lock',
      hashKey: 'LockID',
      attribute: [{
        name: "LockID",
        type: "S"
      }],
      billingMode: 'PAY_PER_REQUEST'
    })

  }

  
}

const app = new App();
new BootstrapStack(app, "cdktf-aws-bootstrap");
app.synth();
