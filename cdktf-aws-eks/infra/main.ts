import { Construct } from "constructs";
import { App, TerraformStack, S3Backend } from "cdktf";
import * as aws from "@cdktf/provider-aws";
import { Vpc } from './.gen/modules/vpc';

const REGION = 'eu-west-1'
const EKS_ASSUME_ROLE_POLICY = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "eks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}

const EKS_PODS_EXECUTION_ASSUME_ROLE_POLICY = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "eks-fargate-pods.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}

class EksStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new aws.AwsProvider(this, "aws", {
      region: REGION,
    });

    new S3Backend(this, {
      bucket: 's3-deployments-061161181198-eu-west-1',
      key: `trfstate/${name}/${REGION}`,
      region: REGION,
      dynamodbTable: 'tf-state-lock'

    })

    const vpc = new Vpc(this, 'EksVpc', {
      name: 'eks-vpc',
      cidr: '10.0.0.0/16',
      azs: ['eu-west-1a', 'eu-west-1b', 'eu-west-1c'],
      privateSubnets: ['10.0.1.0/24', '10.0.2.0/24', '10.0.3.0/24'],
      publicSubnets: ['10.0.101.0/24', '10.0.102.0/24', '10.0.103.0/24'],
      enableNatGateway: true,
      publicSubnetTags: {
        'usage': 'eks',
        'type': 'public'
      },
      privateSubnetTags: {
        'usage': 'eks',
        'type': 'private'
      }
    })

    const subnetIds = new aws.vpc.DataAwsSubnetIds(this, 'subnets-ids', {
      dependsOn: [vpc],
      vpcId: vpc.vpcIdOutput,
    })

    const pivrateSubnetIds = new aws.vpc.DataAwsSubnetIds(this, 'private-subnets-ids', {
      dependsOn: [vpc],
      vpcId: vpc.vpcIdOutput,
      tags: {
        'type': 'private'
      }
    })

    // AWS EKS Cluster Role
    const eksRole = new aws.iam.IamRole(this, 'eks-cluster-role', {
      name: 'role-eks-cluster',
      assumeRolePolicy: JSON.stringify(EKS_ASSUME_ROLE_POLICY),
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/AmazonEKSClusterPolicy'
      ]
    })

    const eksCluster = new aws.eks.EksCluster(this, 'eks-cluster', {
      dependsOn: [vpc],
      name: 'test-cluster',
      roleArn: eksRole.arn,
      vpcConfig: {
        subnetIds: subnetIds.ids
      },
      enabledClusterLogTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"]
    })

    // AWS EKS Pod execution role
    const podExecutionRole = new aws.iam.IamRole(this, 'eks-pods-execution-role', {
      name: 'role-eks-pods-execution',
      assumeRolePolicy: JSON.stringify(EKS_PODS_EXECUTION_ASSUME_ROLE_POLICY),
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy'
      ]
    })

    new aws.eks.EksFargateProfile(this, 'main-fargate-profile', {
      clusterName: eksCluster.name,
      fargateProfileName: 'main',
      podExecutionRoleArn: podExecutionRole.arn,
      subnetIds: pivrateSubnetIds.ids,
      selector: [{
        namespace: 'default'
      }]
    })
  }
}

const app = new App();

new EksStack(app, "aws-eks-infra");
app.synth();
